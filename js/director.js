import {PokerEngine, MTT_LEVELS} from './engine.js';
import {chooseBotAction} from './strategy.js';

// Multi-table tournament director. Every table is a real independent PokerEngine.
// Off-screen tables play their hands when the human finishes a hand. Blinds
// advance by hands, not elapsed wall-clock time, to support mobile practice.
export const MTT_DEFAULTS = Object.freeze({opening:36,late:14,reentryLimit:8,lateRounds:14,initialStack:12000,handsPerLevel:5,maxAtTable:9});
export const MTT_PAYOUTS = [35,22,15,10,8,6,4]; // illustrative, not Running Aces' real payout schedule
const firstNames=['Alex','Jordan','Sam','Taylor','Morgan','Casey','Riley','Avery','Reese','Kai','Quinn','Jamie','Harper','Logan','Parker','Blake','Hayden','Devon','Cameron','Robin','Jess','Dana','Emery','Charlie','Finley','Drew','Sky','Rowan','Terry','Dakota'];
const kinds=['tag','lag','nit','balanced','station','tag','balanced'];
const clone=p=>({id:p.id,name:p.name,kind:p.kind,stack:p.stack,finish:p.finish??null});
const engineFields=['players','button','handNo','stage','board','log','lastResult','winners','currentBet','lastFullRaise','turn','deck','session','level','sb','bb','ante','smallBlindSeat','bigBlindSeat'];

export class TournamentDirector {
  constructor(settings={}){
    this.settings={...MTT_DEFAULTS,...settings};
    this.round=1;this.entries=0;this.nextId=0;this.lateCount=0;this.reentries=0;
    this.knockouts=[];this.knownPlayers=[];this.tables=[];
    this.heroFinish=null;this.championId=null;this.news=['Event started with partially filled tables'];
    const roster=[];
    for(let i=0;i<this.settings.opening;i++)roster.push(this.makePlayer(i===0));
    this.installGroups(this.evenGroups(roster,this.tableCount(roster.length)),0);
  }
  get prizes(){return MTT_PAYOUTS;}
  get remaining(){return this.tables.reduce((n,t)=>n+t.players.filter(p=>p.stack>0).length,0);}
  get heroTable(){return this.tables.find(t=>t.players.some(p=>p.id===0))??null;}
  get hero(){return this.heroTable?.players.find(p=>p.id===0)??null;}
  get averageStack(){return Math.round(this.entries*this.settings.initialStack/Math.max(1,this.remaining));}
  get registrationOpen(){return this.round<=this.settings.lateRounds;}
  get completed(){return this.heroFinish!==null||this.championId!==null;}
  get totalChips(){return this.tables.reduce((n,t)=>n+t.bankroll,0);}
  get totalPotential(){return this.entries*this.settings.initialStack;}
  get levels(){return MTT_LEVELS;}
  tableCount(n,current=null){
    if(n<=9)return 1;
    if(current===null)return Math.ceil(n/6); // start at six-handed tables
    let count=current;
    while(count>1&&n<(count-1)*6)count--;
    while(n>count*9)count++;
    return count;
  }
  makePlayer(human=false,rebuyName=null){
    const id=this.nextId++;
    const name=human?'You':rebuyName??`${firstNames[(id-1)%firstNames.length]} ${String(Math.floor((id-1)/firstNames.length)+1).padStart(2,'0')}`;
    const p={id,name,kind:human?'human':kinds[(id*11)%kinds.length],stack:this.settings.initialStack,finish:null};
    this.entries++;this.knownPlayers.push({id,name,kind:p.kind});
    return p;
  }
  evenGroups(roster,count){
    const groups=Array.from({length:count},()=>[]);
    // Hero remains seat zero within their table for clear phone controls.
    const hero=roster.find(p=>p.id===0);
    if(hero){groups[0].push(hero);roster=roster.filter(p=>p.id!==0);}
    let index=hero?1:0;
    for(const p of roster){groups[index%count].push(p);index++;}
    return groups;
  }
  installGroups(groups,oldRound){
    const priorButtons=new Map(this.tables.flatMap(t=>t.players.map(p=>[p.id,t.players[t.button]?.id])));
    const priorHeroSession=this.heroTable?.session;
    this.tables=groups.map((group,groupNo)=>{
      const players=group.slice();
      if(players.length<2||players.length>9)throw new Error(`Invalid table size ${players.length}`);
      if(players.some(p=>p.id===0)){players.sort((a,b)=>a.id===0?-1:b.id===0?1:0);}
      const t=new PokerEngine({players,initialStack:this.settings.initialStack,handsPerLevel:this.settings.handsPerLevel,multiTable:true,blindLevels:MTT_LEVELS,enableBBAnte:true,startImmediately:false});
      if(oldRound>0){
        const match=priorButtons.get(group.some(p=>p.id===0)?0:group[0]?.id);
        const previous=players.findIndex(p=>p.id===match);
        t.button=previous;
        t.handNo=this.round-1;
        t.stage='idle';t.startHand();
      } else t.startHand();
      if(players.some(p=>p.id===0)&&priorHeroSession)t.session={...priorHeroSession};
      return t;
    });
  }
  // Every hero click advances the other real tables by one matching hand.
  // Bots only receive botView(), which contains no opponent hole cards.
  simulateOffscreen(){
    for(const table of this.tables){
      if(table===this.heroTable)continue;
      let safety=0;
      while(table.stage!=='complete'&&table.stage!=='tournamentOver'){
        if(++safety>2500)throw new Error('Off-table action limit exceeded');
        const i=table.turn;
        if(i<0)throw new Error('Off-table hand stalled');
        const decision=chooseBotAction(table.botView(i),Math.random,{fast:true});
        table.act(i,decision.action,decision.raiseTo);
      }
    }
  }
  settleKnockouts(){
    const busted=[];
    for(const table of this.tables)for(const p of table.players)if(p.stack===0 && p.finish===null)busted.push(p);
    // When several off-screen players bust in a simulated round, chip count at
    // start of their final hand breaks the tie; exact timestamps aren't modeled.
    busted.sort((a,b)=>a.handStartingStack-b.handStartingStack||a.id-b.id);
    const before=this.remaining+busted.length;
    for(let i=0;i<busted.length;i++){
      const p=busted[i];p.finish=before-i;
      this.knockouts.push({id:p.id,place:p.finish,round:this.round,startingStack:p.handStartingStack});
      if(p.id===0)this.heroFinish=p.finish;
    }
    if(busted.length)this.news.unshift(`${busted.length} elimination${busted.length===1?'':'s'} in round ${this.round}`);
    if(this.remaining===1){const winner=this.tables.flatMap(t=>t.players).find(p=>p.stack>0);this.championId=winner?.id??null;if(this.championId===0)this.heroFinish=1;}
    return busted;
  }
  addArrivals(busted){
    const arrivals=[];
    if(this.registrationOpen){
      // Distribute late entries over the registration window: up to 14 people.
      const target=Math.min(this.settings.late,Math.floor(this.round*this.settings.late/this.settings.lateRounds));
      while(this.lateCount<target){arrivals.push(this.makePlayer());this.lateCount++;}
      // Re-entry is optional for computer players and counts as a NEW entry.
      for(const p of busted){
        if(p.id===0||this.reentries>=this.settings.reentryLimit)continue;
        if(Math.random()<0.8){arrivals.push(this.makePlayer(false,p.name+' R'));this.reentries++;}
      }
      if(arrivals.length)this.news.unshift(`${arrivals.length} new entries/re-entries joined`);
    }
    return arrivals;
  }
  advance(){
    const heroTable=this.heroTable;
    if(this.completed||!heroTable||heroTable.stage!=='complete')throw new Error('Finish your current hand before advancing');
    this.simulateOffscreen();
    const busted=this.settleKnockouts();
    if(this.completed)return;
    const arrivals=this.addArrivals(busted);
    let groups=this.tables.map(t=>t.players.filter(p=>p.stack>0).map(clone));
    // Fill the shortest table first; break/open tables only when field size requires it.
    for(const p of arrivals){groups.sort((a,b)=>a.length-b.length);groups[0].push(p);}
    const live=groups.flat();
    const desired=this.tableCount(live.length,groups.length);
    if(desired!==groups.length){groups=this.evenGroups(live,desired);this.news.unshift(`Tables consolidated / opened: ${desired} active`);}
    else{
      // Balance existing tables within one seat, moving bots rather than hero.
      for(let k=0;k<30;k++){
        groups.sort((a,b)=>a.length-b.length);
        if(groups.at(-1).length-groups[0].length<=1)break;
        const big=groups.at(-1),small=groups[0];
        const idx=big.findLastIndex(p=>p.id!==0);
        if(idx<0)break;
        small.push(big.splice(idx,1)[0]);
      }
    }
    this.round++;
    // The constructor deals once; then the new round is explicitly dealt with
    // correct level, starting stacks, and current seat assignments.
    this.installGroups(groups,1);
    this.news=this.news.slice(0,7);
  }
  export(){
    const tables=this.tables.map(t=>{const x={pending:[...t.pending]};for(const key of engineFields)x[key]=t[key];return x;});
    return {version:3,settings:this.settings,round:this.round,entries:this.entries,nextId:this.nextId,lateCount:this.lateCount,reentries:this.reentries,knockouts:this.knockouts,knownPlayers:this.knownPlayers,heroFinish:this.heroFinish,championId:this.championId,news:this.news,tables};
  }
  static restore(data){
    if(data?.version!==3 || !Array.isArray(data.tables) || !data.tables.length || data.tables.length>15 || !Number.isInteger(data.entries))throw new Error('Invalid save');
    const obj=Object.create(TournamentDirector.prototype);
    for(const key of ['settings','round','entries','nextId','lateCount','reentries','knockouts','knownPlayers','heroFinish','championId','news'])obj[key]=data[key];
    obj.tables=data.tables.map(saved=>{
      const t=new PokerEngine({players:saved.players.map(clone),initialStack:obj.settings.initialStack,handsPerLevel:obj.settings.handsPerLevel,multiTable:true,blindLevels:MTT_LEVELS,enableBBAnte:true,startImmediately:false});
      for(const key of engineFields)t[key]=saved[key];
      t.pending=new Set(saved.pending);
      return t;
    });
    if(!obj.heroTable||obj.heroTable.players[0].id!==0||obj.totalChips!==obj.totalPotential)throw new Error('Inconsistent save');
    return obj;
  }
}
