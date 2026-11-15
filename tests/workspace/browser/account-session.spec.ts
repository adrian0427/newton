import { expect, test } from "@playwright/test";
import { fakeMediaArgs, serverMode } from "./server-mode";
test.use({ launchOptions: { args: fakeMediaArgs() } });
const sessionId = "ccaf9362-14b1-4b89-8fb2-c911c9ff1d70";
test("signed-in workspace creates one owned session and clears work after successful logout", async ({ page }) => {
  let creations = 0, signOuts = 0, signedIn = true;
  await page.route("**/auth/session", route => {
    if (route.request().method() === "DELETE") {
      signOuts++;
      if (signOuts === 1) return route.fulfill({status:502,json:{error:{message:"retry"}}});
      signedIn = false; return route.fulfill({json:{signedOut:true}});
    }
    return route.fulfill(signedIn ? {json:{user:{email:"synthetic@example.com"}}} : {status:401,json:{error:{message:"Please sign in."}}});
  });
  await page.route("**/api/study-sessions", route => {
    creations++;
    expect(route.request().method()).toBe("POST"); expect(route.request().postData()).toBeNull();
    return route.fulfill({status:201,json:{session:{id:sessionId,startedAt:new Date().toISOString(),endedAt:null}}});
  });
  await page.goto("/study");
  const account = page.getByRole("region",{name:"Study session"});
  await expect(account.getByRole("button", {name:"Start study session"})).toBeVisible();
  expect(creations).toBe(0);
  await account.getByRole("button",{name:"Start study session"}).click();
  await expect(account.getByText(/Study session ready/)).toBeVisible();
  expect(creations).toBe(1);
  // An owned session enables local development voice; production and previews keep it disabled.
  await page.getByRole("button",{name:"Open Newton"}).click();
  const startVoice = page.getByRole("button",{name:"Start voice",exact:true});
  if (serverMode() === "development") await expect(startVoice).toBeEnabled();
  else await expect(startVoice).toBeDisabled();
  await page.getByRole("button",{name:"Dismiss Newton"}).click();
  const whiteboard = page.getByRole("checkbox", {name:"Whiteboard",exact:true});
  const mobilePanels = await whiteboard.isVisible();
  if (mobilePanels) await whiteboard.check();
  await page.getByRole("button", {name:"Settings",exact:true}).click();
  const settings = page.getByRole("dialog",{name:"Settings"});
  await settings.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(account.getByRole("alert")).toContainText("preserved");
  await expect(account.getByText(/Study session ready/)).toBeVisible();
  if (mobilePanels) await expect(whiteboard).toBeChecked();
  await settings.getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(account.getByRole("link",{name:"Sign in with Google"})).toBeVisible();
  await expect(settings.getByText(/synthetic@example.com/)).toHaveCount(0);
  if (mobilePanels) await expect(whiteboard).not.toBeChecked();
  expect(creations).toBe(1);
});

test("anonymous and failed session creation never issue voice credentials",async ({page})=>{
  let authenticated=false, creations=0, tokens=0;
  await page.route("**/auth/session",route=>route.fulfill(authenticated ? {json:{user:{email:"synthetic@example.com"}}} : {status:401,json:{error:{message:"Please sign in."}}}));
  await page.route("**/api/study-sessions",route=>{creations++;return route.fulfill({status:502,json:{error:{message:"unavailable"}}});});
  await page.route("**/api/realtime/token",route=>{tokens++;return route.fulfill({status:503,json:{error:{message:"unavailable"}}});});
  await page.goto("/study");
  const account=page.getByRole("region",{name:"Study session"});
  await expect(account.getByRole("link",{name:"Sign in with Google"})).toBeVisible();
  expect(creations).toBe(0);
  authenticated=true; await page.reload();
  await account.getByRole("button",{name:"Start study session"}).click();
  await expect(account.getByRole("alert")).toContainText("Unable to start");
  await page.getByRole("button",{name:"Open Newton"}).click();
  await expect(page.getByRole("button",{name:"Start voice",exact:true})).toBeDisabled();
  expect(tokens).toBe(0);
});

test("authenticated local voice uses the real UUID without the harness header and reuses it", async ({page})=>{
  test.skip(serverMode() !== "development","Authenticated voice exists only in local development; the production case is asserted above");
  let tokens=0,creations=0;
  await page.route("**/auth/session",route=>route.fulfill({json:{user:{email:"synthetic@example.com"}}}));
  await page.route("**/api/study-sessions",route=>{creations++;return route.fulfill({status:201,json:{session:{id:sessionId}}});});
  await page.route("**/api/realtime/token",route=>{
    tokens++;expect(route.request().postDataJSON()).toEqual({sessionId});
    expect(route.request().headers()["x-newton-voice-dev"]).toBeUndefined();
    return route.fulfill({status:503,json:{error:{message:"mocked provider unavailable"}}});
  });
  await page.goto("/study");
  await page.getByRole("button",{name:"Start study session"}).click();
  await expect(page.getByText(/Study session ready/)).toBeVisible();
  await page.getByRole("button",{name:"Open Newton"}).click();
  await page.getByRole("button",{name:"Start voice",exact:true}).click();
  await expect(page.getByText(/Voice credentials are unavailable/)).toBeVisible();
  await page.getByRole("button",{name:"Start voice",exact:true}).click();
  await expect.poll(()=>tokens).toBe(2);expect(creations).toBe(1);
});

test("device-local work stays with its account across logout, account changes and reload", async ({page}) => {
  let email: string | null = "first@example.com";
  await page.route("**/auth/session", route => {
    if (route.request().method() === "DELETE") { email=null; return route.fulfill({json:{signedOut:true}}); }
    return route.fulfill(email ? {json:{user:{email}}} : {status:401,json:{error:{message:"Please sign in"}}});
  });
  async function structured() {
    await expect(page.locator(".workspace-split")).toBeAttached();
    const tab=page.getByRole("button",{name:"Whiteboard",exact:true}); if(await tab.isVisible()) await tab.click();
    await page.getByRole("radio",{name:"Structured input"}).check();
    await expect(page.locator("math-field")).toBeVisible();
  }
  await page.goto("/study"); await structured();
  await page.locator("math-field").click(); await expect(page.locator("math-field")).toBeFocused(); await page.keyboard.type("2(x+3)");
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)");
  // Wait for an observable IndexedDB save, rather than an arbitrary autosave delay.
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{
    const open=indexedDB.open("newton-workspace"); open.onsuccess=()=>{
      const db=open.result; const read=db.transaction("parts").objectStore("parts").get(["account:first@example.com","work"]);
      read.onsuccess=()=>{resolve(read.result?.expression);db.close();};
    };
  }))).toBe("2*(x+3)");
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  await page.getByRole("dialog",{name:"Settings"}).getByRole("button",{name:"Sign out",exact:true}).click();
  await expect(page.getByRole("link",{name:"Sign in with Google"})).toBeVisible();
  await page.reload(); await structured();
  await expect(page.getByText("Plain expression:")).not.toContainText("2*(x+3)");
  email="second@example.com"; await page.reload(); await structured();
  await expect(page.getByText("Plain expression:")).not.toContainText("2*(x+3)");
  email="first@example.com"; await page.reload(); await structured();
  await expect(page.getByText("Plain expression:")).toContainText("2*(x+3)");
});

test("logout closes an active SDK voice connection and microphone before clearing the account", async ({browser}) => {
  test.skip(serverMode() !== "development","Authenticated voice exists only in local development; production keeps it disabled");
  const context=await browser.newContext({permissions:["microphone"]});
  const page=await context.newPage(); let signedIn=true, closed=false;
  await page.addInitScript(()=>{
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const tracked=window as Window & { acceptanceTracks?: MediaStreamTrack[] };
    tracked.acceptanceTracks=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await capture(constraints);tracked.acceptanceTracks!.push(...stream.getTracks());return stream;};
  });
  await page.route("**/auth/session",route=>{
    if(route.request().method()==="DELETE"){signedIn=false;return route.fulfill({json:{signedOut:true}});}
    return route.fulfill(signedIn?{json:{user:{email:"voice@example.com"}}}:{status:401,json:{error:{message:"Please sign in"}}});
  });
  await page.route("**/api/study-sessions",route=>route.fulfill({status:201,json:{session:{id:sessionId}}}));
  await page.route("**/api/realtime/token",route=>route.fulfill({json:{clientSecret:"fake.header.signature",expiresAt:new Date(Date.now()+30000).toISOString()}}));
  await page.routeWebSocket(/agent\.deepgram\.com/,socket=>{
    socket.onClose(()=>{closed=true;});
    socket.onMessage(message=>{if(typeof message==="string" && JSON.parse(message).type==="Settings")socket.send(JSON.stringify({type:"SettingsApplied"}));});
    socket.send(JSON.stringify({type:"Welcome",request_id:"00000000-0000-0000-0000-000000000001"}));
  });
  try {
    await page.goto("/study"); await page.getByRole("button",{name:"Start study session"}).click();
    await expect(page.getByText("Study session ready.",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Open Newton"}).click();
    await page.getByRole("button",{name:"Start voice",exact:true}).click();
    await expect(page.getByText("Voice: listening",{exact:true})).toBeVisible({timeout:15000});
    await page.getByRole("button",{name:"Settings",exact:true}).click();
    await page.getByRole("dialog",{name:"Settings"}).getByRole("button",{name:"Sign out",exact:true}).click();
    await expect(page.getByRole("link",{name:"Sign in with Google"})).toBeVisible();
    await expect.poll(()=>closed).toBe(true);
    await expect.poll(()=>page.evaluate(()=>{
      const tracks=(window as Window & {acceptanceTracks?:MediaStreamTrack[]}).acceptanceTracks;
      return !!tracks?.length && tracks.every(track=>track.readyState==="ended");
    })).toBe(true);
  } finally {await context.close();}
});
