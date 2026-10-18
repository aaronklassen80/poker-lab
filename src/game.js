
// Poker Lab's deterministic, dependency-free game engine.
// Monetary units are integer simulated dollars/chips. No rake and no real-money functionality.
const RANKS = '23456789TJQKA';
const SUITS = ['s','h','d','c'];
const cardName = c => c ? RANKS[c.r-2]+c.s : '??';
const makeDeck = () => {
  const d=[];
  for(let r=2;r<=14;r++) for(const s of SUITS) d.push({r,s});
  return d;
};
function shuffle(cards, random=Math.random) {
  for(let i=cards.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [cards[i], cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
const desc = (a,b)=>b-a;
const straightHigh = ranks => {
  const u=new Set(ranks);
  if(u.has(14)) u.add(1);
  for(let top=14;top>=5;top--) if([0,1,2,3,4].every(off=>u.has(top-off))) return top;
  return 0;
};
const handCategories = ['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
function evaluate(cards) {
  if(cards.length<5 || cards.length>7) throw new Error('Evaluate requires 5–7 cards');
  const counts=new Map(), suits=new Map();
  for(const c of cards) {
    counts.set(c.r, (counts.get(c.r)||0)+1);
    if(!suits.has(c.s)) suits.set(c.s,[]);
    suits.get(c.s).push(c.r);
  }
  const ranks=[...counts.keys()].sort(desc);
  const flushRanks=[...suits.values()].find(a=>a.length>=5);
  if(flushRanks) {
    const sf=straightHigh(flushRanks);
    if(sf) return [8,sf];
  }
  const quads=ranks.filter(r=>counts.get(r)===4);
  if(quads.length) return [7,quads[0],ranks.find(r=>r!==quads[0])];
  const trips=ranks.filter(r=>counts.get(r)>=3);
  if(trips.length) {
    const pairForFull=ranks.find(r=>r!==trips[0] && counts.get(r)>=2);
    if(pairForFull) return [6,trips[0],pairForFull];
  }
  if(flushRanks) return [5,...flushRanks.sort(desc).slice(0,5)];
  const straight=straightHigh(ranks);
  if(straight) return [4,straight];
  if(trips.length) return [3,trips[0],...ranks.filter(r=>r!==trips[0]).slice(0,2)];
  const pairs=ranks.filter(r=>counts.get(r)>=2);
  if(pairs.length>=2) return [2,pairs[0],pairs[1],ranks.find(r=>r!==pairs[0]&&r!==pairs[1])];
  if(pairs.length) return [1,pairs[0],...ranks.filter(r=>r!==pairs[0]).slice(0,3)];
  return [0,...ranks.slice(0,5)];
}
function compareHands(a,b) {
  for(let i=0;i<Math.max(a.length,b.length);i++) {
    const d=(a[i]||0)-(b[i]||0);
    if(d) return Math.sign(d);
  }
  return 0;
}
function equityMonteCarlo(heroCards, board, opponentCount=1, trials=600, random=Math.random) {
  if(!Array.isArray(heroCards)||heroCards.length!==2 || board.length>5) throw new Error('Invalid equity input');
  if(!Number.isInteger(opponentCount)||opponentCount<1||opponentCount>8) throw new Error('Invalid opponent count');
  const seen=new Set([...heroCards,...board].map(cardName));
  if(seen.size!==heroCards.length+board.length) throw new Error('Duplicate cards');
  const available=makeDeck().filter(c=>!seen.has(cardName(c)));
  if(board.length+heroCards.length+2*opponentCount>52) throw new Error('Not enough cards');
  let points=0, wins=0, ties=0;
  for(let t=0;t<trials;t++) {
    // Partial Fisher–Yates, ensuring new unknown holdings on every trial.
    const deck=available.slice(), drawn=[];
    const needed=5-board.length+2*opponentCount;
    for(let i=0;i<needed;i++) {
      const j=i+Math.floor(random()*(deck.length-i));
      [deck[i],deck[j]]=[deck[j],deck[i]];
      drawn.push(deck[i]);
    }
    const fullBoard=board.concat(drawn.slice(0,5-board.length));
    const h=evaluate([...heroCards,...fullBoard]);
    let lost=false, split=1;
    for(let i=0;i<opponentCount;i++) {
      const off=5-board.length+2*i;
      const o=evaluate([...fullBoard, drawn[off],drawn[off+1]]);
      const cmp=compareHands(h,o);
      if(cmp<0) { lost=true; break; }
      if(cmp===0) split++;
    }
    if(!lost) {points+=1/split; if(split===1) wins++;else ties++;}
  }
  return {equity:points/trials, winRate:wins/trials, tieRate:ties/trials, trials, opponentCount};
}
function nextIn(index, predicate) {
  for(let delta=1;delta<=6;delta++) {
    const i=(index+delta)%6;
    if(predicate(i)) return i;
  }
  return -1;
}
const initialPlayers = [
  {name:'You',kind:'human'},
  {name:'Marco',kind:'tag'},
  {name:'Sasha',kind:'lag'},
  {name:'Ellis',kind:'nit'},
  {name:'River',kind:'balanced'},
  {name:'Drew',kind:'station'}
];
class PokerEngine {
  constructor({initialStack=200, smallBlind=1, bigBlind=2, players=initialPlayers, random=Math.random}={}) {
    if(players.length!==6) throw new Error('Six seats required in prototype');
    this.random=random;
    this.initialStack=initialStack;
    this.sb=smallBlind;
    this.bb=bigBlind;
    this.players=players.map((p,i)=>({index:i,name:p.name,kind:p.kind,stack:initialStack, cards:[], bet:0, committed:0, folded:false, allIn:false, inHand:true, acted:false, raiseLocked:false, voluntary:false, preflopRaised:false}));
    this.button=-1;
    this.handNo=0;
    this.stage='idle';
    this.board=[];
    this.log=[];
    this.lastResult='';
    this.winners=[];
    this.currentBet=0;
    this.lastFullRaise=bigBlind;
    this.pending=new Set();
    this.turn=-1;
    this.deck=[];
    this.session={hands:0, voluntary:0, preflopRaises:0};
    this.startHand();
  }
  get pot() { return this.players.reduce((sum,p)=>sum+p.committed,0); }
  eligible(i) { const p=this.players[i]; return p.inHand&&!p.folded; }
  canAct(i) {return this.eligible(i)&&!this.players[i].allIn&&this.players[i].stack>0;}
  logAction(message) {this.log.push(message); if(this.log.length>85)this.log.shift();}
  draw() { const c=this.deck.pop(); if(!c) throw new Error('Deck exhausted'); return c; }
  pushChips(i,amount) {
    const p=this.players[i];
    const n=Math.min(p.stack,Math.max(0,amount));
    p.stack-=n;p.bet+=n;p.committed+=n;
    if(!p.stack) p.allIn=true;
    return n;
  }
  startHand() {
    if(this.stage!=='idle'&&this.stage!=='complete') throw new Error('Current hand unfinished');
    // Prototype maintains a full six-handed table. Bots buy back to 100BB between hands.
    for(const p of this.players) if(p.kind!=='human'&&p.stack<this.bb) p.stack=this.initialStack;
    if(this.players[0].stack<this.bb) {this.stage='rebuy';this.turn=-1;return;}
    this.handNo++;
    this.button=nextIn(this.button,i=>this.players[i].stack>0);
    this.deck=shuffle(makeDeck(),this.random);
    this.board=[];this.stage='preflop';this.lastResult='';this.winners=[];
    this.log=[];
    for(const p of this.players) {
      p.cards=[this.draw(),this.draw()];p.bet=0;p.committed=0;p.folded=false;p.allIn=false;
      p.inHand=p.stack>0;p.acted=false;p.raiseLocked=false;p.voluntary=false;p.preflopRaised=false;
    }
    const sbIndex=nextIn(this.button,i=>this.eligible(i));
    const bbIndex=nextIn(sbIndex,i=>this.eligible(i));
    this.smallBlindSeat=sbIndex;this.bigBlindSeat=bbIndex;
    this.pushChips(sbIndex,this.sb);
    this.pushChips(bbIndex,this.bb);
    this.currentBet=Math.max(this.players[sbIndex].bet,this.players[bbIndex].bet);
    this.lastFullRaise=this.bb;
    this.pending=new Set(this.players.filter(p=>this.canAct(p.index)).map(p=>p.index));
    this.turn=nextIn(bbIndex,i=>this.pending.has(i));
    this.logAction(`Hand #${this.handNo} · $${this.sb}/$${this.bb} blinds · ${this.players[this.button].name} has the button`);
    this.logAction(`${this.players[sbIndex].name} posts $${this.players[sbIndex].bet}; ${this.players[bbIndex].name} posts $${this.players[bbIndex].bet}`);
    this.session.hands++;
  }
  rebuy() {
    if(this.stage!=='rebuy'&&this.stage!=='complete') return false;
    this.players[0].stack=this.initialStack;
    if(this.stage==='rebuy')this.stage='complete';
    this.startHand();return true;
  }
  legal(i=this.turn) {
    if(i!==this.turn||!this.canAct(i)||!this.pending.has(i)) return null;
    const p=this.players[i],toCall=Math.min(p.stack,Math.max(0,this.currentBet-p.bet));
    const fullCall=Math.max(0,this.currentBet-p.bet);
    const maxTo=p.bet+p.stack;
    const minRaiseTo=this.currentBet===0?this.bb:this.currentBet+this.lastFullRaise;
    const canRaise=!p.raiseLocked&&maxTo>this.currentBet;
    return {toCall,fullCall,maxTo,minRaiseTo,canCheck:fullCall===0,canCall:fullCall>0,canRaise,allInIsRaise:maxTo>this.currentBet,
      minLegalRaiseTo:Math.min(minRaiseTo,maxTo),canFullRaise:canRaise&&maxTo>=minRaiseTo};
  }
  act(i,action,raiseTo) {
    const options=this.legal(i);
    if(!options) throw new Error('It is not your turn');
    const p=this.players[i], oldCurrent=this.currentBet;
    let increased=false,fullRaise=false;
    if(action==='fold') {
      p.folded=true;
      this.logAction(`${p.name} folds`);
    } else if(action==='check') {
      if(!options.canCheck)throw new Error('Cannot check facing a bet');
      this.logAction(`${p.name} checks`);
    } else if(action==='call') {
      if(!options.canCall)throw new Error('Nothing to call');
      const paid=this.pushChips(i,options.toCall);
      this.logAction(`${p.name} calls $${paid}${p.allIn?' (all-in)':''}`);
    } else if(action==='raise') {
      if(!options.canRaise)throw new Error('Raising not allowed');
      if(!Number.isInteger(raiseTo)||raiseTo<=this.currentBet||raiseTo>options.maxTo) throw new Error('Invalid raise size');
      if(raiseTo<options.minRaiseTo&&raiseTo!==options.maxTo)throw new Error(`Minimum raise to $${options.minRaiseTo}`);
      this.pushChips(i,raiseTo-p.bet);
      this.currentBet=p.bet;
      const delta=this.currentBet-oldCurrent;
      fullRaise=delta>=this.lastFullRaise;
      if(fullRaise) this.lastFullRaise=delta;
      increased=true;
      this.logAction(`${p.name} ${oldCurrent===0?'bets':'raises to'} $${p.bet}${p.allIn?' (all-in)':''}`);
    } else throw new Error('Unknown action');
    if(this.stage==='preflop' && i===0) {
      if((action==='call'||action==='raise')&&!p.voluntary){p.voluntary=true;this.session.voluntary++;}
      if(action==='raise'&&!p.preflopRaised){p.preflopRaised=true;this.session.preflopRaises++;}
    }
    if(fullRaise) {
      // Full raises reopen betting. Incomplete all-in raises require a response
      // but do not reopen raising for players who have already acted.
      for(const other of this.players) {other.acted=false;other.raiseLocked=false;}
    } else if(increased) {
      for(const other of this.players) if(other.index!==i&&other.acted)other.raiseLocked=true;
    }
    p.acted=true;
    this.pending.delete(i);
    if(increased) for(const other of this.players) if(other.index!==i&&this.canAct(other.index)&&other.bet<this.currentBet) this.pending.add(other.index);
    if(this.players.filter(q=>this.eligible(q.index)).length===1) return this.finishUncontested();
    if(this.pending.size===0)return this.nextStreetOrShowdown();
    this.turn=nextIn(i,j=>this.pending.has(j));
    return this.stage;
  }
  nextStreetOrShowdown() {
    if(this.stage==='river')return this.showdown();
    const map={preflop:['flop',3],flop:['turn',1],turn:['river',1]};
    const next=map[this.stage];
    if(!next) return this.showdown();
    this.stage=next[0];
    for(let i=0;i<next[1];i++)this.board.push(this.draw());
    this.currentBet=0;this.lastFullRaise=this.bb;
    for(const p of this.players){p.bet=0;p.acted=false;p.raiseLocked=false;}
    this.logAction(`— ${this.stage.toUpperCase()}: ${this.board.map(cardName).join(' ')} —`);
    this.pending=new Set(this.players.filter(p=>this.canAct(p.index)).map(p=>p.index));
    if(this.pending.size<=1) {
      // One player can't bet against opponents who are all-in; run out automatically.
      return this.nextStreetOrShowdown();
    }
    this.turn=nextIn(this.button,j=>this.pending.has(j));
    return this.stage;
  }
  finishUncontested() {
    const winner=this.players.find(p=>this.eligible(p.index));
    const won=this.pot;
    winner.stack+=won;
    this.lastResult=`${winner.name} wins $${won} without showdown`;
    this.winners=[winner.index];
    this.logAction(this.lastResult);
    this.turn=-1;this.stage='complete';return this.stage;
  }
  showdown() {
    // Side-pot layering: each contributor pays into levels at their capped commitment.
    // Folded hands contribute to pots but cannot receive winnings.
    this.stage='showdown';
    while(this.board.length<5)this.board.push(this.draw());
    const levels=[...new Set(this.players.map(p=>p.committed).filter(n=>n>0))].sort((a,b)=>a-b);
    let previous=0;
    const gross=new Map(this.players.map(p=>[p.index,0]));
    for(const level of levels) {
      const contributors=this.players.filter(p=>p.committed>=level);
      const amount=(level-previous)*contributors.length;
      const eligible=contributors.filter(p=>this.eligible(p.index));
      if(amount && eligible.length) {
        let best=null,winners=[];
        for(const p of eligible) {
          const value=evaluate([...p.cards,...this.board]);
          if(!best||compareHands(value,best)>0){best=value;winners=[p.index];}
          else if(compareHands(value,best)===0)winners.push(p.index);
        }
        // Odd chips distributed beginning with first winner clockwise of button.
        const order=Array.from({length:6},(_,k)=>(this.button+1+k)%6).filter(i=>winners.includes(i));
        for(const i of order)gross.set(i,gross.get(i)+Math.floor(amount/winners.length));
        for(let n=0;n<amount%winners.length;n++)gross.set(order[n],gross.get(order[n])+1);
      }
      previous=level;
    }
    let descriptions=[];this.winners=[];
    for(const p of this.players) {
      const gained=gross.get(p.index);
      if(gained) {
        p.stack+=gained;this.winners.push(p.index);
        descriptions.push(`${p.name} wins $${gained} (${handCategories[evaluate([...p.cards,...this.board])[0]]})`);
      }
    }
    this.lastResult=descriptions.join(' · ');
    this.logAction(`— SHOWDOWN: ${this.board.map(cardName).join(' ')} —`);
    this.logAction(this.lastResult);
    this.stage='complete';this.turn=-1;
    return this.stage;
  }
  // Sanitized public view for opponent logic; no other player's private cards included.
  botView(i) {
    const p=this.players[i];
    if(p.kind==='human')throw new Error('Not a computer player');
    return {self:{index:i,kind:p.kind,stack:p.stack,bet:p.bet,cards:p.cards.slice()},
      board:this.board.slice(),pot:this.pot,street:this.stage,button:this.button,options:this.legal(i),
      players:this.players.map(x=>({index:x.index,name:x.name,kind:x.kind,stack:x.stack,bet:x.bet,folded:x.folded,allIn:x.allIn,inHand:x.inHand}))};
  }
  get bankroll() {return this.players.reduce((sum,p)=>sum+p.stack,0)+(this.stage==='complete'?0:this.pot);}
}



const highestBase = r => ({14:10,13:8,12:7,11:6}[r]??r/2);
function chenScore(cards) {
  const [a,b]=cards;
  const high=Math.max(a.r,b.r),low=Math.min(a.r,b.r);
  if(high===low) return Math.max(5,highestBase(high)*2);
  let s=highestBase(high);
  if(a.s===b.s) s+=2;
  const gap=high-low-1;
  if(gap===1)s-=1;
  else if(gap===2)s-=2;
  else if(gap===3)s-=4;
  else if(gap>=4)s-=5;
  if(gap<=1 && high<12)s+=1;
  return Math.ceil(Math.max(0,s)*2)/2;
}
const configs={
  tag:{tight:9,pressure:0.10,aggression:0.30,bluff:0.10},
  lag:{tight:6.5,pressure:0.03,aggression:0.48,bluff:0.19},
  nit:{tight:11.0,pressure:0.16,aggression:0.21,bluff:0.025},
  balanced:{tight:8,pressure:0.08,aggression:0.40,bluff:0.12},
  station:{tight:7.5,pressure:-0.05,aggression:0.07,bluff:0.02}
};
function positionBonus(view) {
  // Approximate late-position opportunity based on seats after the button.
  const dist=(view.self.index-view.button+6)%6;
  if(dist===0) return 1.5;
  if(dist===5) return 1.1;
  if(dist===4) return 0.6;
  return 0;
}
function betTarget(view,factor) {
  const {options,self,pot}=view;
  const base=Math.max(2,Math.round(pot*factor));
  if(options.canRaise) return Math.min(options.maxTo,Math.max(options.minLegalRaiseTo,view.street==='preflop'?Math.max(6,options.minLegalRaiseTo):view.options.fullCall+self.bet+base));
  return null;
}
function chooseBotAction(view,random=Math.random) {
  const {self,options,street,board,players}=view;
  if(!options)throw new Error('No bot action available');
  const cfg=configs[self.kind]||configs.tag;
  const facing=options.fullCall>0;
  const toCall=options.toCall;
  const potOdds=facing?toCall/(view.pot+toCall):0;
  const count=players.filter(p=>p.inHand&&!p.folded&&p.index!==self.index).length;
  if(street==='preflop') {
    const score=chenScore(self.cards)+positionBonus(view);
    const adjusted=score-(facing&&options.fullCall>2?1.6:0);
    const strongest=adjusted>=cfg.tight+4.0;
    const playable=adjusted>=cfg.tight;
    const premium=adjusted>=cfg.tight+2.5;
    const canRaise=options.canRaise;
    if(strongest&&canRaise&&random()<0.88) return {action:'raise',raiseTo:betTarget(view,1.0)};
    if(premium&&canRaise&&random()<0.52) return {action:'raise',raiseTo:betTarget(view,0.67)};
    if(facing) {
      if(playable || (self.kind==='station'&&adjusted>=cfg.tight-2 && random()<0.6))return {action:'call'};
      return {action:'fold'};
    }
    if(playable&&canRaise&&random()<(self.kind==='station'?0.18:0.64))return {action:'raise',raiseTo:betTarget(view,0.8)};
    return {action:'check'};
  }
  // Approximate opponent-independent showdown equity against random hands.
  // This is NOT a GTO solver or range-aware strategy.
  const samples=count>3?72:115;
  const eq=equityMonteCarlo(self.cards,board,Math.max(1,count),samples,random).equity;
  const made=evaluate([...self.cards,...board]);
  const pressure=cfg.pressure+(facing&&options.fullCall>view.pot*0.7?0.05:0);
  const raiseThreshold=Math.max(0.46,0.69-(count===1?0.09:0));
  if(facing) {
    if(eq < potOdds+pressure && !(made[0]>=5&&toCall<self.stack*0.3))return {action:'fold'};
    if(eq>raiseThreshold&&options.canRaise&&random()<cfg.aggression) return {action:'raise',raiseTo:betTarget(view,0.6)};
    return {action:'call'};
  }
  if(options.canRaise) {
    if(eq>Math.max(0.48,0.53-(count===1?0.08:0)) && random()<cfg.aggression+0.2)
      return {action:'raise',raiseTo:betTarget(view,0.55)};
    if(count===1&&random()<cfg.bluff&&eq<0.32)
      return {action:'raise',raiseTo:betTarget(view,0.55)};
  }
  return {action:'check'};
}

function coachSnapshot(engine) {
  const i=0,p=engine.players[i],opt=engine.legal(i);
  if(!opt) return {available:false,title:'Coach is ready',body:'When it is your turn, open Coach to review the exact betting math and an estimated showdown equity.'};
  const rivals=engine.players.filter(x=>x.inHand&&!x.folded&&x.index!==i);
  const fullCall=opt.fullCall, call=opt.toCall;
  const pot=engine.pot;
  const sidePotRisk=engine.players.some(x=>x.allIn&&x.inHand&&!x.folded);
  const potOdds=fullCall>0?call/(pot+call):0;
  const eq=equityMonteCarlo(p.cards,engine.board,Math.max(1,rivals.length),600);
  const score=chenScore(p.cards);
  const per=round=>`${(round*100).toFixed(1)}%`;
  let takeaway;
  if(engine.stage==='preflop') {
    if(score>=13) takeaway='This is a strong starting-hand candidate; consider your position and previous raises before choosing a size.';
    else if(score>=9) takeaway='This hand is often playable, but position and the action before you are decisive.';
    else takeaway='This is a marginal starting hand; avoid assuming that suited cards or an ace automatically justify a call.';
  } else if(fullCall===0)takeaway='Checking costs nothing. Whether betting is better depends on which worse hands call and which better hands fold.';
  else if(eq+0.02>=potOdds)takeaway='Equity versus random holdings exceeds the break-even call percentage, but the actual betting range may be much stronger.';
  else takeaway='Estimated random-hand equity is below the immediate pot-odds threshold. Folding may be reasonable, but implied odds and ranges matter.';
  return {
    available:true,title:'Decision analysis',stage:engine.stage,pot,toCall:call,fullCall,potOdds,sidePotRisk,equity:eq.equity,confidence:`${eq.trials} Monte Carlo runouts`,opponents:rivals.length,score,
    exact:fullCall>0?(sidePotRisk?`Simple full-pot ratio: $${call} / $${pot+call} = ${per(potOdds)}. An all-in player may create side pots, so this may NOT be your actual break-even equity requirement.`:`Calling $${call} to compete for a resulting $${pot+call} pot requires ${per(potOdds)} equity to break even on an immediate call, assuming no future betting and no rake.`):'Checking is free. The minimum opening bet is $2.',
    estimate:`Estimated showdown equity: ${per(eq.equity)} versus ${rivals.length} uniformly random opponent hand${rivals.length===1?'':'s'} (including split-pot shares).`,
    takeaway, caveat:'This is a mathematical training aid, NOT a solver-validated recommendation. Opponents do not actually hold random ranges after choosing to bet, call, or raise. No GTO/EV decision grade is claimed.'
  };
}



const $ = id => document.getElementById(id);
const engine=new PokerEngine();
let mode='coach', analyzedHand=-1, analyzedStreet='', analyzedAtTurn=-1, latestCoach=null, raiseTo=6, timer=null, handArchive=[];
try {handArchive=JSON.parse(localStorage.getItem('pokerlab-history-v1')||'[]');if(!Array.isArray(handArchive))handArchive=[];}catch{}
const money=n=>`$${n.toLocaleString()}`;
const suitSymbols={s:'♠',h:'♥',d:'♦',c:'♣'};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const asPercent=n=>(100*n).toFixed(1)+'%';
function cardHtml(c) {
  if(!c)return '<div class="card-placeholder"></div>';
  return `<div class="card-face ${c.s==='h'||c.s==='d'?'red':''}" aria-label="${esc(cardName(c))}"><span class="rank">${'23456789TJQKA'[c.r-2]}</span><span class="suit">${suitSymbols[c.s]}</span></div>`;
}
const backHtml=()=>'<div class="card-back" aria-label="Face down card"></div>';
function phaseName(s){return {preflop:'PREFLOP',flop:'FLOP',turn:'TURN',river:'RIVER',complete:'HAND COMPLETE',rebuy:'REBUY REQUIRED'}[s]||s.toUpperCase();}
function seatPosition(p) {
  const relative=(p.index-engine.button+6)%6;
  if(relative===0)return 'BTN';
  if(relative===1)return 'SB';
  if(relative===2)return 'BB';
  if(relative===3)return 'UTG';
  if(relative===4)return 'HJ';
  return 'CO';
}
function renderSeats() {
  const complete=engine.stage==='complete';
  const showOpponentCards=complete && engine.board.length===5 && engine.players.filter(p=>p.inHand&&!p.folded).length>=2;
  $('players').innerHTML=engine.players.map(p=>{
    const revealed=p.index===0 || (showOpponentCards && !p.folded);
    const holes=p.cards.length? p.cards.map(c=>revealed?cardHtml(c):backHtml()).join('') : '';
    const folded=p.folded?'is-folded':'';
    const winner=complete&&engine.winners.includes(p.index)?'is-winner':'';
    return `<div class="seat seat-${p.index} ${engine.turn===p.index?'is-turn':''} ${folded} ${winner}"><div class="seat-hole">${holes}</div><div class="seat-card"><div class="player-name">${esc(p.name)}${p.index===0?' ★':''}</div><div class="player-stack">${money(p.stack)}</div><div class="player-meta">${p.folded?'FOLDED':p.allIn?'ALL IN':p.kind==='human'?'YOUR SEAT':p.kind.toUpperCase()}</div>${p.index===engine.button?'<div class="dealer">D</div>':''}</div>${p.bet>0&&engine.stage!=='complete'?`<div class="seat-bet">${money(p.bet)}</div>`:''}</div>`;
  }).join('');
}
function clearAnalysis(){latestCoach=null;analyzedAtTurn=-1;analyzedStreet='';}
function analyze() {
  if(engine.turn!==0||!engine.legal(0)){latestCoach={available:false,title:'No decision right now',body:'You can analyze a decision when it is your turn. We will add after-hand coaching and replay in a later build.'};}
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
  area.innerHTML=`<div class="quick-coach-head">COACH · MATH AT YOUR DECISION</div><div class="quick-coach-numbers"><span>${c.sidePotRisk?'Simple ratio':'Pot odds'}: <strong>${c.fullCall?asPercent(c.potOdds):'Free check'}</strong></span><span>Random-hand equity: <strong>${asPercent(c.equity)}</strong></span></div><p>${esc(c.takeaway)}</p><small>Random-opponent estimate only — not GTO advice. Full explanation below.</small>`;
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
  $('coach-view').innerHTML=`<div class="analysis-metrics"><div class="metric"><span>${c.sidePotRisk?'Simple pot ratio':'Pot odds to call'}</span><strong>${c.fullCall?asPercent(c.potOdds):'FREE'}</strong></div><div class="metric"><span>Equity vs random</span><strong>${asPercent(c.equity)}</strong></div></div><h3>Exact betting math</h3><p>${esc(c.exact)}</p><h3>Equity estimate</h3><p>${esc(c.estimate)}</p><h3>Learning note</h3><p>${esc(c.takeaway)}</p><p class="caveat">${esc(c.caveat)}</p>`;
}
function renderActions() {
  const actions=$('decision-controls'),r=$('raise-controls');
  r.classList.add('hidden');
  const hero=engine.players[0];
  if(engine.stage==='rebuy') {
    actions.innerHTML='<button class="action-button next" data-action="rebuy">REBUY $200 TO CONTINUE</button>';
    $('turn-status').textContent='You need a rebuy to continue.';$('status-bet').textContent='';return;
  }
  if(engine.stage==='complete') {
    actions.innerHTML='<button class="action-button next" data-action="next">DEAL NEXT HAND →</button>';
    $('turn-status').textContent='Hand complete';$('status-bet').textContent='';return;
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
  $('board').innerHTML=Array.from({length:5},(_,i)=>cardHtml(engine.board[i])).join('');
  $('street').textContent=phaseName(engine.stage);
  $('hand-index').textContent='#'+String(engine.handNo).padStart(3,'0');
  $('log').innerHTML=engine.log.slice().reverse().map(line=>`<div class="log-row">${esc(line)}</div>`).join('');
  $('hands-stat').textContent=engine.session.hands;
  $('vpip-stat').textContent=engine.session.hands>0?asPercent(engine.session.voluntary/engine.session.hands):'—';
  $('pfr-stat').textContent=engine.session.hands>0?asPercent(engine.session.preflopRaises/engine.session.hands):'—';
  $('result').textContent=engine.stage==='complete'?engine.lastResult:'';
  renderActions();renderCoach();
}
function saveHand() {
  if(engine.stage!=='complete')return;
  const record={number:engine.handNo,board:engine.board.map(cardName),hole:engine.players[0].cards.map(cardName),result:engine.lastResult,log:engine.log.slice(),date:new Date().toISOString()};
  handArchive.unshift(record);handArchive=handArchive.slice(0,30);
  try{localStorage.setItem('pokerlab-history-v1',JSON.stringify(handArchive));}catch{}
}
function proceedBots() {
  clearTimeout(timer);
  if(engine.stage==='complete'||engine.stage==='rebuy'||engine.turn===0)return;
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
  if(action==='next'){engine.startHand();clearAnalysis();raiseTo=6;render();proceedBots();return;}
  if(action==='rebuy'){engine.rebuy();clearAnalysis();raiseTo=6;render();proceedBots();return;}
  try{engine.act(0,action,action==='raise'?raiseTo:undefined);}
  catch(e){$('result').textContent=e.message;return;}
  if(engine.stage==='complete')saveHand();
  clearAnalysis();raiseTo=6;render();proceedBots();
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
render();proceedBots();

