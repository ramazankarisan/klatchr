/** The room-code alphabet and length — the one source for both generating a code and
 * recognising one (the web's `/<CODE>` join link reads codes against these). */
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 4;

/** A four-letter room code from an injected random source, unique in the room set. */
export function generateRoomCode(random: () => number, taken: ReadonlySet<string>): string {
  let code = buildCode(random);
  while (taken.has(code)) {
    code = buildCode(random);
  }
  return code;
}

/** Whether `code` is exactly a code `generateRoomCode` could mint (case-sensitive). */
export function isRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH && [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch))
  );
}

function buildCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET.charAt(Math.floor(random() * ROOM_CODE_ALPHABET.length));
  }
  return code;
}
