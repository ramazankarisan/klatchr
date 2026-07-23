const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 4;

/** A four-letter room code from an injected random source, unique in the room set. */
export function generateRoomCode(random: () => number, taken: ReadonlySet<string>): string {
  let code = buildCode(random);
  while (taken.has(code)) {
    code = buildCode(random);
  }
  return code;
}

function buildCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET.charAt(Math.floor(random() * ALPHABET.length));
  }
  return code;
}
