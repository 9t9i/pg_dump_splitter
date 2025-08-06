import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadFixture(filename: string): string {
  const fixturePath = join(__dirname, '..', 'fixtures', filename);
  return readFileSync(fixturePath, 'utf8');
}
