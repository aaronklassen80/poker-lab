import test from 'node:test';
import assert from 'node:assert/strict';
import {PokerEngine, makeDeck, evaluate, compareHands, TOURNAMENT_LEVELS, equityMonteCarlo} from '../js/engine.js';
import {chooseBotAction, coachSnapshot} from '../js/strategy.js';
const cards=s=>s.trim().split(/\s+/).map(x=>({r:'23456789TJQKA'.indexOf(x[0])+2,s:x[1]}));
const one=()=>new PokerEngine();
function actCall(e) {const opts=e.legal(e.turn); assert.ok(opts,'must have legal turn'); const i=e.turn;e.act(i,opts.canCheck?'check':'call');}
function finishHand(e,max=250){let n=0;while(e.stage!=='complete' && n++<max)actCall(e);assert.equal(e.stage,'complete');}
function finishGameBots(e,maxHands=350){
  for(let h=0;h<maxHands;h++){
    let actions=0;
    while(e.stage!=='complete' && e.stage!=='tournamentOver' && actions++<350) {
      const i=e.turn;assert.ok(i>=0, `turn missing on ${e.stage}`);
      const options=e.legal(i);assert.ok(options);
      const ai=i===0?({action:options.canCheck?'check':Math.random()<0.25?'fold':'call'}):chooseBotAction(e.botView(i));
      e.act(i,ai.action,ai.raiseTo);
      assert.equal(e.bankroll,e.initialTotal,'chip conservation');
    }
    assert.ok(actions<350,'no action lock');
    if(e.tournamentWinner!==null||e.heroFinish!==null)break;
    e.startHand();
  }
  assert.ok(e.tournamentWinner!==null||e.heroFinish!==null,'tournament stops when hero finishes or wins');
}
test('52 cards without duplicates and equity between zero and one',()=>{
  assert.equal(new Set(makeDeck().map(c=>c.r+c.s)).size,52);
  const eq=equityMonteCarlo(cards('As Ad'),cards('2h 7s 9c'),2,100);
  assert.ok(eq.equity>=0&&eq.equity<=1);
});
test('hand categories and exact kicker comparisons',()=>{
  for(const [hand,cat] of [['As Ks Qs Js Ts',8],['Ah Ad Ac As 3d',7],['Ah Ad Ac Ks Kd',6],['2h 4h 6h 8h Th',5],['9d 8c 7c 6s 5h',4],['Ah Ad Ac 4s 7h',3],['Ah Ad 3c 3s 7h',2],['Ah Ad 4c 8s 7h',1],['Ah Kd Qd 9s 7h',0]])assert.equal(evaluate(cards(hand))[0],cat);
  assert.ok(compareHands(evaluate(cards('As 2s 3d 4h 5c')),evaluate(cards('2h 3s 4s 5h 6c')))<0);
});
test('eight players start at 2000 chips and level 1 blinds 10/20',()=>{
  const e=one();assert.equal(e.players.length,8);assert.equal(e.button,0);
  assert.equal(e.sb,10);assert.equal(e.bb,20);assert.equal(e.level,1);
  assert.equal(e.smallBlindSeat,1);assert.equal(e.bigBlindSeat,2);assert.equal(e.turn,3);
  assert.equal(e.pot,30);assert.equal(e.bankroll,16000);assert.equal(e.remaining,8);
});
test('all eight act then flop; button and blinds rotate',()=>{
  const e=one();for(let i=0;i<7;i++)actCall(e);actCall(e);
  assert.equal(e.stage,'flop');assert.equal(e.board.length,3);
  finishHand(e);e.startHand();assert.equal(e.button,1);assert.equal(e.smallBlindSeat,2);assert.equal(e.bigBlindSeat,3);
});
test('preflop raises and short all-in rules',()=>{
  const e=one();assert.throws(()=>e.act(3,'raise',30),/Minimum/);
  e.act(3,'raise',60);assert.equal(e.currentBet,60);assert.equal(e.lastFullRaise,40);
  e.players[4].stack=50; // this player has to put all 50 to reach 50
  e.act(4,'call');assert.equal(e.players[4].stack,0);assert.equal(e.players[4].allIn,true);
});
test('ante-free blind progression is by hands, not real-world clock',()=>{
  const e=new PokerEngine({handsPerLevel:2});
  finishHand(e);e.startHand();assert.equal(e.level,1);assert.equal(e.bb,20);
  finishHand(e);e.startHand();assert.equal(e.level,2);assert.equal(e.sb,15);assert.equal(e.bb,30);
});
test('button skips eliminated seat and blind positions adjust',()=>{
  const e=one();finishHand(e);
  e.players[1].stack=0;e.players[1].finish=8;e.finishOrder.push(1); // synthetic posthand bust
  e.startHand();assert.equal(e.button,2);assert.equal(e.smallBlindSeat,3);assert.equal(e.bigBlindSeat,4);
});
test('headsup puts small blind on button and button acts first preflop',()=>{
  const e=one();finishHand(e);
  for(let i=2;i<8;i++){e.players[i].stack=0;e.players[i].finish=9-i;e.finishOrder.push(i);}
  e.startHand();assert.equal(e.remaining,2);
  assert.equal(e.smallBlindSeat,e.button);assert.notEqual(e.bigBlindSeat,e.button);
  assert.equal(e.turn,e.button);
});
test('headsup postflop big blind acts first',()=>{
  const e=one();finishHand(e);
  for(let i=2;i<8;i++){e.players[i].stack=0;e.players[i].finish=9-i;e.finishOrder.push(i);}
  e.startHand();const btn=e.button,bb=e.bigBlindSeat;
  e.act(btn,'call');e.act(bb,'check');assert.equal(e.stage,'flop');assert.equal(e.turn,bb);
});
test('simultaneous eliminations assign worse place to smaller starting stack',()=>{
  const e=one();finishHand(e);
  for(let i=0;i<8;i++)e.players[i].handStartingStack=1000+i*20;
  e.players[2].handStartingStack=150;e.players[4].handStartingStack=700;
  e.players[2].stack=0;e.players[4].stack=0;
  e.finalizeEliminations();assert.equal(e.players[2].finish,8);assert.equal(e.players[4].finish,7);
});
test('hero elimination ends playable tournament; no rebuys',()=>{
  const e=one();finishHand(e);
  e.players[0].stack=0;e.players[0].handStartingStack=200;e.finalizeEliminations();
  assert.equal(e.heroFinish,8);
  e.startHand();assert.equal(e.stage,'tournamentOver');
  e.restartTournament();assert.equal(e.handNo,1);assert.equal(e.remaining,8);assert.equal(e.bankroll,16000);
});
test('winner is declared when one player remains',()=>{
  const e=one();finishHand(e);
  for(let i=1;i<8;i++){e.players[i].stack=0;}
  e.finalizeEliminations();assert.equal(e.tournamentWinner,0);assert.equal(e.heroFinish,1);
});
test('bot snapshot hides opponents private cards',()=>{
  const e=one();const snapshot=e.botView(3);
  assert.equal(snapshot.players[0].cards,undefined);assert.equal(snapshot.self.cards.length,2);
  assert.equal(snapshot.bigBlind,20);assert.equal(snapshot.paidPlaces,3);
});
test('coach recognizes tournament chip stack and explains ICM limitation',()=>{
  const e=one();for(let i=3;i<8;i++)actCall(e);
  assert.equal(e.turn,0);const c=coachSnapshot(e);
  assert.equal(c.pot,130);assert.equal(c.toCall,20);assert.equal(c.potOdds,20/150);
  assert.ok(c.effectiveBb>0);assert.match(c.caveat,/ICM/);
});
test('side pots distribute winner chips and conserve total across 8 seats',()=>{
  const e=one();
  e.players.forEach((p,i)=>{p.committed=[100,60,25,0,0,0,0,0][i];p.stack=2000-p.committed;p.folded=i>2;p.inHand=i<=2;});
  e.board=cards('2h 4c 6d 9s Jh');e.players[0].cards=cards('Ad Kc');e.players[1].cards=cards('Qs Qd');e.players[2].cards=cards('Jc Jd');
  e.showdown();assert.equal(e.players[2].stack,1975+75);assert.equal(e.players[1].stack,1940+70);assert.equal(e.players[0].stack,1900+40);assert.equal(e.bankroll,16000);
});
test('short all-ins do not reopen previous actor',()=>{
  const e=one();e.players[4].stack=70;
  e.act(3,'raise',60);e.act(4,'raise',70);
  for(const i of [5,6,7,0,1,2])e.act(i,'call');
  assert.equal(e.turn,3);assert.equal(e.legal(3).canRaise,false);
  e.act(3,'call');assert.equal(e.stage,'flop');
});
test('entire 8-player tournament progresses without chip inflation',()=>{
  for(let i=0;i<2;i++)finishGameBots(one(),250);
});