/** Normalize MathLive ASCIIMath to the initial Algebra I transport syntax.
 * This validates notation only, never mathematical correctness.
 * Supported: numbers, single-letter variables, + - * / ^, parentheses, one =.
 */
export function normalizeExpression(ascii: string): string {
  const input = ascii.trim().replaceAll("−", "-").replaceAll("×", "*").replaceAll("·", "*");
  if (!input) return "";
  if (input.length > 500) throw new Error("Use an expression of 500 characters or fewer.");
  if (/[^\dA-Za-z\s.+\-*/^()=]/.test(input) || /[A-Za-z]\s*[A-Za-z]/.test(input)) {
    throw new Error("Use numbers, single-letter variables, parentheses, and + - * / ^ =. This notation cannot be exported yet.");
  }
  const tokens = input.match(/(?:\d+(?:\.\d+)?|\.\d+)|[A-Za-z()+\-*/^=]/g) ?? [];
  if (tokens.join("") !== input.replace(/\s/g, "")) throw new Error("Check the number or symbol in your expression.");
  const expanded: string[] = [];
  const endAtom = (token: string) => /^[\d.A-Za-z]/.test(token) || token === ")";
  const startAtom = (token: string) => /^[\d.A-Za-z]/.test(token) || token === "(";
  for (const token of tokens) {
    const previous = expanded.at(-1);
    if (previous && endAtom(previous) && startAtom(token)) {
      if (/^[\d.]/.test(previous) && /^[\d.]/.test(token)) throw new Error("Check the spacing between numbers.");
      expanded.push("*");
    }
    expanded.push(token);
  }
  let index = 0;
  function atom(): void {
    if (expanded[index] === "+" || expanded[index] === "-") { index++; atom(); return; }
    const token = expanded[index++];
    if (token === "(") {
      sum();
      if (expanded[index++] !== ")") throw new Error("Close each pair of parentheses.");
    } else if (!token || !/^(?:\d+(?:\.\d+)?|\.\d+|[A-Za-z])$/.test(token)) {
      throw new Error("Complete the expression before capturing.");
    }
  }
  function power(): void { atom(); if (expanded[index] === "^") { index++; power(); } }
  function product(): void { power(); while (expanded[index] === "*" || expanded[index] === "/") { index++; power(); } }
  function sum(): void { product(); while (expanded[index] === "+" || expanded[index] === "-") { index++; product(); } }
  sum();
  if (expanded[index] === "=") { index++; sum(); }
  if (index !== expanded.length) throw new Error("Check the parentheses and equality sign.");
  const result = expanded.join("");
  if (result.length > 500) throw new Error("Use an expression of 500 characters or fewer.");
  return result;
}
