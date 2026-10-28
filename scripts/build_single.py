"""Build standalone, offline-playable MTT trainer from tested module source."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
html=(root/'index.html').read_text()
css=(root/'styles.css').read_text()
engine=(root/'js/engine.js').read_text()
strategy=(root/'js/strategy.js').read_text()
director=(root/'js/director.js').read_text()
app=(root/'js/app.js').read_text()
for key in ('export const ','export function ','export class '):
    engine=engine.replace(key,key.replace('export ',''))
    strategy=strategy.replace(key,key.replace('export ',''))
    director=director.replace(key,key.replace('export ',''))
strategy=strategy.replace("import {evaluate,equityMonteCarlo} from './engine.js';",'')
director=director.replace("import {PokerEngine, MTT_LEVELS} from './engine.js';",'').replace("import {chooseBotAction} from './strategy.js';",'')
app=app.replace("import {cardName} from './engine.js';",'').replace("import {TournamentDirector, MTT_PAYOUTS} from './director.js';",'').replace("import {chooseBotAction,coachSnapshot} from './strategy.js';",'')
css='\n'.join(line for line in css.splitlines() if not line.startswith('@import url('))
html=html.replace('<link rel="stylesheet" href="styles.css" />','<style>\n'+css+'\n</style>')
html=html.replace('<script type="module" src="js/app.js"></script>', '<script>\n'+engine+'\n'+strategy+'\n'+director+'\n'+app+'\n</script>')
(root/'poker-lab-offline.html').write_text(html)
print('Built offline file:',root/'poker-lab-offline.html',len(html),'chars')
