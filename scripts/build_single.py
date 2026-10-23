"""Build a single-file playable demo, suitable for offline desktop use."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
css=(root/'styles.css').read_text()
engine=(root/'js/engine.js').read_text()
strategy=(root/'js/strategy.js').read_text()
app=(root/'js/app.js').read_text()
engine=engine.replace('export const ', 'const ').replace('export function ', 'function ').replace('export class ', 'class ')
strategy=strategy.replace("import {evaluate,equityMonteCarlo} from './engine.js';",'').replace('export function ','function ')
app=app.replace("import {PokerEngine, cardName,handCategories,evaluate} from './engine.js';",'').replace("import {chooseBotAction,coachSnapshot} from './strategy.js';",'')
# Self-contained / no external fonts — native font fallbacks work offline.
css='\n'.join(line for line in css.splitlines() if not line.startswith('@import url('))
html=html.replace('<link rel="stylesheet" href="styles.css" />','<style>\n'+css+'\n</style>')
html=html.replace('<script type="module" src="js/app.js"></script>','<script>\n'+engine+'\n'+strategy+'\n'+app+'\n</script>')
output=root.parent/'poker-lab.html'
output.write_text(html)
(root/'poker-lab.html').write_text(html)
print(f'Built {output} ({output.stat().st_size:,} bytes)')