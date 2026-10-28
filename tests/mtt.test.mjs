import test from 'node:test';
import assert from 'node:assert/strict';
import {TournamentDirector} from '../js/director.js';
import {chooseBotAction,coachSnapshot} from '../js/strategy.js';

function playHeroHand(d,policy='check'){
  const t=d.heroTable;
  let count=0;
  while(t.stage!=='complete'){
    assert.ok(++count<200,'hand should finish');
    const i=t.turn;
    assert.ok(i>=0);
    const legal=t.legal(i);
    let action;
    if(i===0){
      if(policy==='fold')action=legal.canCheck?'check':'fold';
      else action=legal.canCheck?'check':legal.canCall?'call':'fold';
    } else action=chooseBotAction(t.botView(i),Math.random,{fast:true}).action;
    if(action==='raise')action=legal.canCheck?'check':legal.canCall?'call':'fold';
    t.act(i,action);
  }
  return t;
}
test('opens 36 players at 6-handed tables and accounts for every chip',()=>{
  const d=new TournamentDirector();
  assert.deepEqual(d.tables.map(t=>t.players.length),[6,6,6,6,6,6]);
  assert.equal(d.heroTable.players[0].name,'You');
  assert.equal(d.totalChips,432000);
  assert.equal(d.entries,36);
  assert.equal(d.heroTable.bb,100);
});
test('late entries and multiple tables progress without disappearing chips',()=>{
  const d=new TournamentDirector();
  for(let k=0;k<16&&!d.completed;k++){
    playHeroHand(d,'check');d.advance();
    assert.equal(d.totalChips,d.totalPotential,`round ${d.round} bankroll should reconcile`);
    assert.equal(d.remaining,d.tables.flatMap(t=>t.players).filter(p=>p.stack>0).length);
    assert.ok(d.tables.every(t=>t.players.length>=2&&t.players.length<=9));
    assert.equal(d.heroTable.players[0].id,0);
    assert.equal(d.heroTable.handNo,d.round);
  }
  assert.equal(d.lateCount,14);
  assert.ok(d.entries>=50 && d.entries<=58,`total entries ${d.entries}`);
  assert.equal(d.registrationOpen,false);
});
test('big blind ante is committed to the pot but does not count toward the blind bet',()=>{
  const d=new TournamentDirector({opening:6,late:0,reentryLimit:0,lateRounds:1,handsPerLevel:1});
  for(let j=0;j<2;j++){playHeroHand(d);d.advance();}
  assert.equal(d.heroTable.level,3);
  const t=d.heroTable,big=t.players[t.bigBlindSeat];
  assert.equal(t.ante,t.bb);
  assert.equal(big.bet,Math.min(big.handStartingStack,t.bb));
  assert.ok(big.committed>=big.bet);
  assert.equal(d.totalChips,d.totalPotential);
});
test('mid-hand save and restore preserves the field, hidden deck, chip totals and pending actions',()=>{
  const d=new TournamentDirector();
  const t=d.heroTable;
  if(t.turn!==0){const i=t.turn;const l=t.legal(i);t.act(i,l.canCheck?'check':l.canCall?'call':'fold');}
  const save=JSON.parse(JSON.stringify(d.export()));
  const restored=TournamentDirector.restore(save);
  assert.equal(restored.round,d.round);
  assert.equal(restored.entries,d.entries);
  assert.equal(restored.totalChips,restored.totalPotential);
  assert.equal(restored.heroTable.stage,d.heroTable.stage);
  assert.equal(restored.heroTable.turn,d.heroTable.turn);
  assert.deepEqual([...restored.heroTable.pending],[...d.heroTable.pending]);
  assert.deepEqual(restored.heroTable.players[0].cards,d.heroTable.players[0].cards);
});
test('multi-table coach references global remaining players rather than local table size',()=>{
  const d=new TournamentDirector();
  const t=d.heroTable;
  while(t.turn!==0){const i=t.turn,l=t.legal(i);t.act(i,l.canCheck?'check':l.canCall?'call':'fold');}
  const c=coachSnapshot(t,{remaining:d.remaining,prizes:d.prizes,registrationOpen:d.registrationOpen});
  assert.equal(c.remaining,36);
  assert.equal(c.tablePlayers,6);
  assert.equal(c.paidPlaces,7);
  assert.match(c.caveat,/NOT prize equity/);
});
test('75 longer independent tournament simulations conserve chips through reentries and table changes',()=>{
  for(let sample=0;sample<15;sample++){
    const d=new TournamentDirector();
    for(let hand=0;hand<125&&!d.completed;hand++){
      const t=d.heroTable;let moves=0;
      while(t.stage!=='complete'){
        assert.ok(++moves<600,'every hand completes');
        const i=t.turn,l=t.legal(i);
        let choice;
        if(i===0){
          const old=t.players[0].kind;t.players[0].kind='tag';
          choice=chooseBotAction(t.botView(0),Math.random,{fast:true});
          t.players[0].kind=old;
        }else choice=chooseBotAction(t.botView(i),Math.random,{fast:true});
        t.act(i,choice.action,choice.raiseTo);
      }
      d.advance();
      assert.equal(d.totalChips,d.totalPotential,`sample ${sample} hand ${hand}`);
      assert.ok(d.tables.every(tab=>tab.players.length>=2&&tab.players.length<=9));
    }
  }
});
test('a table where all players are all-in on the forced blinds runs straight to showdown',async()=>{
  const {PokerEngine,MTT_LEVELS}=await import('../js/engine.js');
  const t=new PokerEngine({players:[{id:0,name:'You',kind:'human'},{id:1,name:'Bot',kind:'tag'}],initialStack:50,blindLevels:MTT_LEVELS,multiTable:true});
  assert.equal(t.stage,'complete');
  assert.equal(t.players.reduce((n,p)=>n+p.stack,0),100);
});
