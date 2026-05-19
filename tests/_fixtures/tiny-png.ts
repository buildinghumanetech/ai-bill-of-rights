// 16x16 PNG of solid red — generated via:
//   sharp({create:{width:16,height:16,channels:3,background:{r:255,g:0,b:0}}})
//     .png().toBuffer()
// Inlined as base64 so tests don't need a binary file on disk.
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVR4nGP4z8BAEmIY1cAwGkr/h2vSAACQ+f8BHMfe7gAAAABJRU5ErkJggg==";

export function tinyPngBuffer(): Buffer {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}
