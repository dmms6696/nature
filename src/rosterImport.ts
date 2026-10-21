export function parseCodeList(input: string): { name: string; code: string }[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\|?\s*:?-{3,}/.test(line))
    .map((line, i) => {
      const cells = line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/[\t,|]/)
        .map((x) => x.trim());
      if (cells.length !== 2 || !cells[0] || !cells[1])
        throw new Error(i + 1 + "번째 줄을 이름, 코드 형식으로 확인하세요.");
      return { name: cells[0], code: cells[1] };
    });
}
