// Poker Lab's deterministic, dependency-free game engine.
// Monetary units are integer simulated dollars/chips. No rake and no real-money functionality.
export const RANKS = '23456789TJQKA';
export const SUITS = ['s','h','d','c'];
export const cardName = c => c ? RANKS[c.r-2]+c.s : '??';
export const makeDeck = () => {
  const d=[];
  for(let r=2;r<=14;r++) for(const s of SUITS) d.push({r,s});
  return d;
};
export function shuffle(cards, random=Math.random) {
  for(let i=cards.length-1;i>0;i--) {
    const j=Math.floor(random()*(i+1));
    [cards[i], cards[j]]=[cards[j],cards[i]];
  }
  return cards;
}
export const TOURNAMENT_LEVELS = [
  [10,20],[15,30],[25,50],[40,80],[50,100],[75,150],
  [100,200],[150,300],[200,400],[300,600],[400,800],[600,1200],
  [800,1600],[1000,2000],[1500,3000]
];
export const PRIZE_PERCENTAGES = [50,30,20];
const desc = (a,b)=>b-a;
const straightHigh = ranks => {
  const u=new Set(ranks);
  if(u.has(14)) u.add(1);
  for(let top=14;top>=5;top--) if([0,1,2,3,4].every(off=>u.has(top-off))) return top;
  return 0;
};
export const handCategories = ['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
export function evaluate(cards) {
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
export function compareHands(a,b) {
  for(let i=0;i<Math.max(a.length,b.length);i++) {
    const d=(a[i]||0)-(b[i]||0);
    if(d) return Math.sign(d);
  }
  return 0;
}
export function equityMonteCarlo(heroCards, board, opponentCount=1, trials=600, random=Math.random) {
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
function nextIn(index, predicate, seats) {
  for(let delta=1;delta<=seats;delta++) {
    const i=(index+delta)%seats;
    if(predicate(i)) return i;
  }
  return -1;
}
export const initialPlayers = [
  {name:'You',kind:'human'},
  {name:'Marco',kind:'tag'},
  {name:'Sasha',kind:'lag'},
  {name:'Ellis',kind:'nit'},
  {name:'River',kind:'balanced'},
  {name:'Drew',kind:'station'},
  {name:'Nina',kind:'tag'},
  {name:'Owen',kind:'balanced'}
];
export class PokerEngine {
  constructor({initialStack=2000, smallBlind=10, bigBlind=20, players=initialPlayers, random=Math.random, handsPerLevel=6}={}) {
    if(players.length<2||players.length>9) throw new Error('Tournament requires 2–9 seats');
    if(!Number.isInteger(handsPerLevel)||handsPerLevel<1) throw new Error('Invalid level length');
    this.handsPerLevel=handsPerLevel;
    this.level=1;
    this.prizes=PRIZE_PERCENTAGES.slice();
    this.initialTotal=initialStack*players.length;
    this.finishOrder=[];
    this.heroFinish=null;
    this.tournamentWinner=null;
    this.random=random;
    this.initialStack=initialStack;
    this.sb=smallBlind;
    this.bb=bigBlind;
    this.players=players.map((p,i)=>({index:i,name:p.name,kind:p.kind,stack:initialStack, cards:[], bet:0, committed:0, folded:false, allIn:false, inHand:true, acted:false, raiseLocked:false, voluntary:false, preflopRaised:false,finish:null,handStartingStack:initialStack}));
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
    if(this.tournamentWinner!==null || this.players[0].stack<=0) {
      this.stage='tournamentOver';this.turn=-1;return;
    }
    const alive=this.players.filter(p=>p.stack>0);
    if(alive.length<2) {
      this.tournamentWinner=alive[0]?.index??null;
      this.stage='tournamentOver';this.turn=-1;return;
    }
    this.handNo++;
    this.level=Math.min(TOURNAMENT_LEVELS.length,Math.floor((this.handNo-1)/this.handsPerLevel)+1);
    [this.sb,this.bb]=TOURNAMENT_LEVELS[this.level-1];
    const seatCount=this.players.length;
    this.button=nextIn(this.button,i=>this.players[i].stack>0,seatCount);
    this.deck=shuffle(makeDeck(),this.random);
    this.board=[];this.stage='preflop';this.lastResult='';this.winners=[];
    this.log=[];
    for(const p of this.players) {
      p.cards=[this.draw(),this.draw()];p.bet=0;p.committed=0;p.folded=false;p.allIn=false;
      p.inHand=p.stack>0;p.acted=false;p.raiseLocked=false;p.voluntary=false;p.preflopRaised=false;
      p.handStartingStack=p.stack;
    }
    // Heads-up: the button posts SB and acts first preflop.
    const headsUp=alive.length===2;
    const sbIndex=headsUp?this.button:nextIn(this.button,i=>this.eligible(i),seatCount);
    const bbIndex=nextIn(sbIndex,i=>this.eligible(i),seatCount);
    this.smallBlindSeat=sbIndex;this.bigBlindSeat=bbIndex;
    this.pushChips(sbIndex,this.sb);
    this.pushChips(bbIndex,this.bb);
    this.currentBet=Math.max(this.players[sbIndex].bet,this.players[bbIndex].bet);
    this.lastFullRaise=this.bb;
    this.pending=new Set(this.players.filter(p=>this.canAct(p.index)).map(p=>p.index));
    this.turn=nextIn(bbIndex,i=>this.pending.has(i),seatCount);
    this.logAction(`Hand #${this.handNo} · Level ${this.level} · ${this.sb}/${this.bb} blinds · ${this.players[this.button].name} on the button`);
    this.logAction(`${this.players[sbIndex].name} posts ${this.players[sbIndex].bet}; ${this.players[bbIndex].name} posts ${this.players[bbIndex].bet}`);
    this.session.hands++;
  }
  // No rebuys in a freezeout. A new tournament resets every seat and every statistic.
  restartTournament() {
    for(const p of this.players) {p.stack=this.initialStack;p.finish=null;p.handStartingStack=this.initialStack;}
    this.button=-1;this.handNo=0;this.level=1;this.sb=TOURNAMENT_LEVELS[0][0];this.bb=TOURNAMENT_LEVELS[0][1];
    this.finishOrder=[];this.heroFinish=null;this.tournamentWinner=null;
    this.session={hands:0,voluntary:0,preflopRaises:0};
    this.stage='idle';this.startHand();
  }
  get remaining(){return this.players.filter(p=>p.stack>0).length;}
  get averageStack(){return Math.round(this.initialTotal/Math.max(1,this.remaining));}
  get nextBlinds(){return TOURNAMENT_LEVELS[Math.min(this.level,TOURNAMENT_LEVELS.length-1)];}
  get handsUntilLevel(){return this.handsPerLevel-((this.handNo-1)%this.handsPerLevel);}
  get placement(){return this.heroFinish??(this.remaining<=1?1:null);}
  finalizeEliminations() {
    const knocked=this.players.filter(p=>p.stack===0 && p.finish===null);
    // Players who bust in the same hand are ordered by chips at the start of that hand.
    knocked.sort((a,b)=>a.handStartingStack-b.handStartingStack||a.index-b.index);
    for(const p of knocked) {
      p.finish=this.players.length-this.finishOrder.length;
      this.finishOrder.push(p.index);
      this.logAction(`${p.name} finishes #${p.finish}`);
      if(p.index===0)this.heroFinish=p.finish;
    }
    if(this.remaining===1){
      const winner=this.players.find(p=>p.stack>0);
      this.tournamentWinner=winner.index;
      winner.finish=1;
      if(winner.index===0)this.heroFinish=1;
      this.logAction(`${winner.name} wins the tournament!`);
    }
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
    this.turn=nextIn(i,j=>this.pending.has(j),this.players.length);
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
    this.turn=nextIn(this.button,j=>this.pending.has(j),this.players.length);
    return this.stage;
  }
  finishUncontested() {
    const winner=this.players.find(p=>this.eligible(p.index));
    const won=this.pot;
    winner.stack+=won;
    this.lastResult=`${winner.name} wins $${won} without showdown`;
    this.winners=[winner.index];
    this.logAction(this.lastResult);
    this.turn=-1;this.stage='complete';this.finalizeEliminations();return this.stage;
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
        const order=Array.from({length:this.players.length},(_,k)=>(this.button+1+k)%this.players.length).filter(i=>winners.includes(i));
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
    this.finalizeEliminations();
    return this.stage;
  }
  // Sanitized public view for opponent logic; no other player's private cards included.
  botView(i) {
    const p=this.players[i];
    if(p.kind==='human')throw new Error('Not a computer player');
    return {self:{index:i,kind:p.kind,stack:p.stack,bet:p.bet,cards:p.cards.slice()},
      board:this.board.slice(),pot:this.pot,street:this.stage,button:this.button,options:this.legal(i),
      level:this.level,bigBlind:this.bb,remaining:this.remaining,paidPlaces:this.prizes.length,
      players:this.players.map(x=>({index:x.index,name:x.name,kind:x.kind,stack:x.stack,bet:x.bet,folded:x.folded,allIn:x.allIn,inHand:x.inHand}))};
  }
  get bankroll() {return this.players.reduce((sum,p)=>sum+p.stack,0)+(this.stage==='complete'||this.stage==='tournamentOver'?0:this.pot);}
}