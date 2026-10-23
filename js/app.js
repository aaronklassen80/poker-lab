import {PokerEngine, cardName,handCategories,evaluate} from './engine.js';
import {chooseBotAction,coachSnapshot} from './strategy.js';
const $ = id => document.getElementById(id);
const SAVE_KEY='pokerlab-sitngo-v2';
const PERSIST_FIELDS=['players','button','handNo','stage','board','log','lastResult','winners','currentBet','lastFullRaise','turn','deck','session','level','sb','bb','finishOrder','heroFinish','tournamentWinner','smallBlindSeat','bigBlindSeat'];
function loadTournament() {
  const e=new PokerEngine();
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return e;
    const data=JSON.parse(raw);
    if(data?.version!==2||data.players?.length!==8||data.players.some(p=>!Number.isInteger(p.stack)||p.stack<0)||!Array.isArray(data.pending)||!Array.isArray(data.deck)||!['preflop','flop','turn','river','complete','tournamentOver'].includes(data.stage))return e;
    if(data.players.reduce((n,p)=>n+p.stack,0)+(data.stage==='complete'||data.stage==='tournamentOver'?0:(data.players.reduce((n,p)=>n+p.committed,0)))!==16000)return e;
    for(const field of PERSIST_FIELDS)if(Object.hasOwn(data,field))e[field]=data[field];
    e.pending=new Set(data.pending);
  } catch (err) {console.warn('Could not restore tournament',err);}
  return e;
}
const engine=loadTournament();
function persistTournament(){
  try {
    const payload={version:2,pending:[...engine.pending]};
    for(const key of PERSIST_FIELDS)payload[key]=engine[key];
    localStorage.setItem(SAVE_KEY,JSON.stringify(payload));
  }catch(err){console.warn('Could not save tournament',err);}
}
let mode='coach', analyzedHand=-1, analyzedStreet='', analyzedAtTurn=-1, latestCoach=null, raiseTo=60, timer=null, handArchive=[];
try {handArchive=JSON.parse(localStorage.getItem('pokerlab-tournaments-v2')||'[]');if(!Array.isArray(handArchive))handArchive=[];}catch{}
const money=n=>n.toLocaleString();
const suitSymbols={s:'♠',h:'♥',d:'♦',c:'♣'};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const asPercent=n=>(100*n).toFixed(1)+'%';
function cardHtml(c) {
  if(!c)return '<div class="card-placeholder"></div>';
  return `<div class="card-face ${c.s==='h'||c.s==='d'?'red':''}" aria-label="${esc(cardName(c))}"><span class="rank">${'23456789TJQKA'[c.r-2]}</span><span class="suit">${suitSymbols[c.s]}</span></div>`;
}
const backHtml=()=>'<div class="card-back" aria-label="Face down card"></div>';
function phaseName(s){return {preflop:'PREFLOP',flop:'FLOP',turn:'TURN',river:'RIVER',complete:'HAND COMPLETE',tournamentOver:'TOURNAMENT FINISHED'}[s]||s.toUpperCase();}
function seatPosition(p) {
  const relative=(p.index-engine.button+engine.players.length)%engine.players.length;
  if(relative===0)return 'BTN';
  if(relative===1)return 'SB';
  if(relative===2)return 'BB';
  if(relative===engine.players.length-1)return 'CO';
  return 'MP';
}
function renderSeats() {
  const complete=engine.stage==='complete';
  const showOpponentCards=complete && engine.board.length===5 && engine.players.filter(p=>p.inHand&&!p.folded).length>=2;
  $('players').innerHTML=engine.players.map(p=>{
    const revealed=p.index===0 || (showOpponentCards && !p.folded);
    const holes=p.cards.length? p.cards.map(c=>revealed?cardHtml(c):backHtml()).join('') : '';
    const folded=p.folded?'is-folded':'';
    const busted=p.stack===0&&p.finish!==null?'is-busted':'';
    const winner=complete&&engine.winners.includes(p.index)?'is-winner':'';
    return `<div class="seat seat-${p.index} ${engine.turn===p.index?'is-turn':''} ${folded} ${winner} ${busted}"><div class="seat-hole">${holes}</div><div class="seat-card"><div class="player-name">${esc(p.name)}${p.index===0?' ★':''}</div><div class="player-stack">${money(p.stack)}</div><div class="player-meta">${p.finish!==null?`OUT · #${p.finish}`:p.folded?'FOLDED':p.allIn?'ALL IN':p.kind==='human'?'YOUR SEAT':p.kind.toUpperCase()}</div>${p.index===engine.button?'<div class="dealer">D</div>':''}</div>${p.bet>0&&engine.stage!=='complete'?`<div class="seat-bet">${money(p.bet)}</div>`:''}</div>`;
  }).join('');
}
function clearAnalysis(){latestCoach=null;analyzedAtTurn=-1;analyzedStreet='';}
function analyze() {
  if(engine.turn!==0||!engine.legal(0)){latestCoach={available:false,title:'No live decision',body:'Analyze during your turn. Tournament hand replay and ICM drills are planned for a later build.'};}
  else { latestCoach=coachSnapshot(engine); analyzedHand=engine.handNo;analyzedStreet=engine.stage;analyzedAtTurn=engine.log.length; }
  renderCoach();
}
function renderQuickCoach() {
  const area=$('quick-coach');
  if(mode==='play'||engine.turn!==0) {area.classList.add('hidden');area.innerHTML='';return;}
  area.classList.remove('hidden');
  if(!latestCoach?.available) {
    area.innerHTML='<button id="quick-analyze">◎ Ask Coach · Reveal the math</button>';
    return;
  }
  const c=latestCoach;
  area.innerHTML=`<div class="quick-coach-head">COACH · TOURNAMENT CONTEXT</div><div class="quick-coach-numbers"><span>Effective: <strong>${c.effectiveBb.toFixed(1)} BB</strong></span><span>Pot odds: <strong>${c.fullCall?asPercent(c.potOdds):'Free check'}</strong></span></div><p>${esc(c.takeaway)}</p><small>${esc(c.moneyStatus)} · No solver / ICM validation. Full explanation below.</small>`;
}
function renderCoach() {
  $('coach-mode-badge').textContent=mode==='play'?'HIDDEN':mode==='training'?'AUTO REVIEW':'ON DEMAND';
  renderQuickCoach();
  $('analyze').classList.toggle('hidden',mode==='play'||mode==='training');
  $('analyze').disabled=engine.turn!==0;
  if(mode==='play') {$('coach-view').innerHTML='<div class="coach-idle"><span class="coach-symbol">♠</span><h3>Play without hints.</h3><p>Coaching is hidden. Switch modes whenever you want.</p></div>';return;}
  if(mode==='training'&&engine.turn===0&&(analyzedHand!==engine.handNo||analyzedStreet!==engine.stage||analyzedAtTurn!==engine.log.length)) {
    latestCoach=coachSnapshot(engine);analyzedHand=engine.handNo;analyzedStreet=engine.stage;analyzedAtTurn=engine.log.length;
    renderQuickCoach();
  }
  if(!latestCoach||!latestCoach.available) {
    const msg=latestCoach?.body??(engine.turn===0?'Tap Analyze for mathematical information about your current decision.':'When it is your turn, tap Analyze to see the math behind your decision.');
    $('coach-view').innerHTML=`<div class="coach-idle"><span class="coach-symbol">◎</span><h3>${latestCoach?.title||'Think before you act.'}</h3><p>${msg}</p></div>`;
    return;
  }
  const c=latestCoach;
  renderQuickCoach();
  $('coach-view').innerHTML=`<div class="analysis-metrics"><div class="metric"><span>Effective stack</span><strong>${c.effectiveBb.toFixed(1)} BB</strong></div><div class="metric"><span>${c.sidePotRisk?'Simple pot ratio':'Pot odds to call'}</span><strong>${c.fullCall?asPercent(c.potOdds):'FREE'}</strong></div></div><h3>Tournament situation · ${esc(c.moneyStatus)}</h3><p>${c.remaining} remaining, top ${engine.prizes.length} paid. Your stack: ${c.bbStack.toFixed(1)} BB. ${c.bubble?'Bubble decisions can differ dramatically from chip-EV decisions.':''}</p><h3>Exact betting math</h3><p>${esc(c.exact)}</p><h3>Equity vs random hands</h3><p>${esc(c.estimate)}</p><h3>Learning note</h3><p>${esc(c.takeaway)}</p><p class="caveat">${esc(c.caveat)}</p>`;
}
function renderActions() {
  const actions=$('decision-controls'),r=$('raise-controls');
  r.classList.add('hidden');
  const hero=engine.players[0];
  if(engine.stage==='tournamentOver'||(engine.stage==='complete' && (engine.heroFinish!==null||engine.tournamentWinner!==null))) {
    actions.innerHTML='<button class="action-button next" data-action="restart">START NEW TOURNAMENT →</button>';
    $('turn-status').textContent=engine.heroFinish===1?'TOURNAMENT CHAMPION!':`You finished #${engine.heroFinish??'?'} of ${engine.players.length}`;
    $('status-bet').textContent=engine.heroFinish&&engine.heroFinish<=engine.prizes.length?`Paid: ${engine.prizes[engine.heroFinish-1]}% of points`:'Tournament finished';
    return;
  }
  if(engine.stage==='complete') {
    actions.innerHTML='<button class="action-button next" data-action="next">DEAL NEXT HAND →</button>';
    $('turn-status').textContent='Hand complete';$('status-bet').textContent=`${engine.remaining} players left`;return;
  }
  if(engine.turn!==0) {
    actions.innerHTML='<button class="action-button" disabled>COMPUTER PLAYING...</button>';
    $('turn-status').textContent=engine.turn<0?'Finishing hand...':`${engine.players[engine.turn].name} is thinking…`;
    $('status-bet').textContent='';return;
  }
  const legal=engine.legal(0);
  if(!legal)return;
  if(legal.canRaise && (raiseTo<legal.minLegalRaiseTo||raiseTo>legal.maxTo)) raiseTo=legal.minLegalRaiseTo;
  $('turn-status').textContent='Your decision';
  $('status-bet').textContent=legal.fullCall?`To call: ${money(legal.toCall)}`:'You can check for free';
  let buttons='<button class="action-button danger" data-action="fold">FOLD</button>';
  buttons+=legal.canCheck?'<button class="action-button" data-action="check">CHECK</button>':`<button class="action-button" data-action="call">${legal.toCall===hero.stack?'CALL ALL-IN':'CALL '+money(legal.toCall)}</button>`;
  if(legal.canRaise) {
    buttons+=`<button class="action-button primary" data-action="raise">${legal.fullCall?'RAISE':'BET'} ${money(raiseTo)}</button>`;
    r.classList.remove('hidden');
    const slider=$('raise-range');
    slider.min=legal.minLegalRaiseTo;slider.max=legal.maxTo;
    if(raiseTo<legal.minLegalRaiseTo||raiseTo>legal.maxTo)raiseTo=legal.minLegalRaiseTo;
    slider.value=raiseTo;$('raise-total').textContent=money(raiseTo);
  }
  actions.innerHTML=buttons;
}
function render() {
  renderSeats();
  $('pot').textContent=money(engine.pot);
  $('level-stat').textContent=`${engine.level} · ${money(engine.sb)} / ${money(engine.bb)}`;
  $('next-level').textContent=engine.level>=15?'Maximum blind level':`${engine.handsUntilLevel} hand${engine.handsUntilLevel===1?'':'s'} until ${engine.nextBlinds.join(' / ')}`;
  $('remaining-stat').textContent=`${engine.remaining} / ${engine.players.length}`;
  $('tourney-phase').textContent=engine.remaining<=3?'IN THE MONEY':engine.remaining===4?'ON THE BUBBLE':'Top 3 paid · 50/30/20';
  $('stack-stat').textContent=`${(engine.players[0].stack/engine.bb).toFixed(1)} BB`;
  $('average-stat').textContent=`Average ${money(engine.averageStack)}`;
  $('board').innerHTML=Array.from({length:5},(_,i)=>cardHtml(engine.board[i])).join('');
  $('street').textContent=phaseName(engine.stage);
  $('hand-index').textContent='#'+String(engine.handNo).padStart(3,'0');
  $('log').innerHTML=engine.log.slice().reverse().map(line=>`<div class="log-row">${esc(line)}</div>`).join('');
  $('hands-stat').textContent=engine.session.hands;
  $('vpip-stat').textContent=engine.session.hands>0?asPercent(engine.session.voluntary/engine.session.hands):'—';
  $('pfr-stat').textContent=engine.session.hands>0?asPercent(engine.session.preflopRaises/engine.session.hands):'—';
  $('result').textContent=(engine.stage==='complete'||engine.stage==='tournamentOver')?engine.lastResult:'';
  renderActions();renderCoach();persistTournament();
}
function saveHand() {
  if(engine.stage!=='complete')return;
  const record={number:engine.handNo,level:engine.level,blinds:[engine.sb,engine.bb],remaining:engine.remaining,board:engine.board.map(cardName),hole:engine.players[0].cards.map(cardName),result:engine.lastResult,log:engine.log.slice(),date:new Date().toISOString()};
  handArchive.unshift(record);handArchive=handArchive.slice(0,30);
  try{localStorage.setItem('pokerlab-tournaments-v2',JSON.stringify(handArchive));}catch{}
}
function proceedBots() {
  clearTimeout(timer);
  if(engine.stage==='complete'||engine.stage==='tournamentOver'||engine.turn===0)return;
  timer=setTimeout(()=>{
    if(engine.turn<0||engine.stage==='complete')return;
    const i=engine.turn;
    let decision;
    try {decision=chooseBotAction(engine.botView(i));engine.act(i,decision.action,decision.raiseTo);}
    catch(e) {console.error('Bot error:',e);try {const l=engine.legal(i);engine.act(i,l?.canCheck?'check':l?.canCall?'call':'fold');}catch(err){console.error(err);return;}}
    if(engine.stage==='complete')saveHand();
    clearAnalysis();render();proceedBots();
  },360);
}
function heroAction(action) {
  if(action==='next'){engine.startHand();clearAnalysis();raiseTo=engine.bb*3;render();proceedBots();return;}
  if(action==='restart'){engine.restartTournament();clearAnalysis();raiseTo=engine.bb*3;render();proceedBots();return;}
  try{engine.act(0,action,action==='raise'?raiseTo:undefined);}
  catch(e){$('result').textContent=e.message;return;}
  if(engine.stage==='complete')saveHand();
  clearAnalysis();raiseTo=engine.bb*3;render();proceedBots();
}
$('decision-controls').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-action]');if(btn)heroAction(btn.dataset.action);
});
$('raise-range').addEventListener('input',e=>{
  raiseTo=Number(e.target.value);$('raise-total').textContent=money(raiseTo);
  const main=$('decision-controls').querySelector('[data-action="raise"]');
  if(main) main.textContent=(engine.legal(0)?.fullCall?'RAISE ':'BET ')+money(raiseTo);
});
$('raise-controls').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const l=engine.legal(0);if(!l)return;
  const amount=b.id==='max-bet'?l.maxTo:Math.round(engine.pot*Number(b.dataset.pct))+engine.currentBet;
  raiseTo=Math.min(l.maxTo,Math.max(l.minLegalRaiseTo,amount));
  $('raise-range').value=raiseTo;$('raise-range').dispatchEvent(new Event('input'));
});
for(const b of document.querySelectorAll('.mode-switch button'))b.addEventListener('click',()=>{
  mode=b.dataset.mode;document.querySelectorAll('.mode-switch button').forEach(el=>el.classList.toggle('selected',el===b));
  clearAnalysis();renderCoach();
});
$('analyze').addEventListener('click',analyze);
$('quick-coach').addEventListener('click',e=>{if(e.target.closest('#quick-analyze')) analyze();});
$('rules').addEventListener('click',()=>$('about-dialog').showModal());
$('close-dialog').addEventListener('click',()=>$('about-dialog').close());
$('reset-tournament').addEventListener('click',()=>{if(!confirm('Restart this tournament? Current chip stacks and progress will be lost.'))return;$('about-dialog').close();engine.restartTournament();clearAnalysis();raiseTo=engine.bb*3;render();proceedBots();});
render();proceedBots();