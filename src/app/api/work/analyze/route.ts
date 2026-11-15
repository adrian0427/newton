import { BackendError, requireUser } from "@/lib/supabase/auth";
import { isSameOrigin } from "@/lib/supabase/origin";
import { readBoundedText, RequestBodyTooLargeError } from "@/lib/http/body";
import { analyzeSubmittedWork, validateSubmittedWork } from "@/lib/learning/analyze";
export async function POST(request:Request){
  let headers:Headers|undefined;
  try{
    if(!isSameOrigin(request)) throw new BackendError(403,"forbidden","This request must come from Newton.");
    const auth=await requireUser();headers=auth.headers;
    if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json") throw new BackendError(400,"invalid-input","Send the confirmed step as JSON.");
    let input:unknown;
    try{input=JSON.parse(await readBoundedText(request,2048));}catch(error){
      throw new BackendError(error instanceof RequestBodyTooLargeError?413:400,"invalid-input","The work submission is invalid or too large.");
    }
    return Response.json(await analyzeSubmittedWork(auth,validateSubmittedWork(input)),{headers});
  }catch(error){
    const failure=error instanceof BackendError?error:new BackendError(502,"backend-unavailable","The work check is unavailable. Please retry.");
    const responseHeaders=new Headers(headers??failure.headers);responseHeaders.set("Cache-Control","private, no-store");
    return Response.json({error:{code:failure.code,message:failure.message,retryable:failure.status>=500}},{status:failure.status,headers:responseHeaders});
  }
}
