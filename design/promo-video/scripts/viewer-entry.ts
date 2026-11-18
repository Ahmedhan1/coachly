import { viewerHtml } from '../../../worker/src/share/page';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2]!, viewerHtml({ nonce: 'n0nce', shareId: process.argv[3]!, imageBase: 'http://localhost:4400/exercise-pack/img/' }));
