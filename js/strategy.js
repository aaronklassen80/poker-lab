import {evaluate,equityMonteCarlo} from './engine.js';
const highestBase = r => ({14:10,13:8,12:7,11:6}[r]??r/2);
export function chenScore(cards) {
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
  const n=view.players.length;
  const dist=(view.self.index-view.button+n)%n;
  if(dist===0)return 1.5;
  if(dist===n-1)return 1.1;
  if(dist===n-2)return 0.6;
  return 0;
}
function betTarget(view,factor) {
  const {options,self,pot}=view;
  const base=Math.max(2,Math.round(pot*factor));
  if(options.canRaise) return Math.min(options.maxTo,Math.max(options.minLegalRaiseTo,view.street==='preflop'?Math.max(view.bigBlind*3,options.minLegalRaiseTo):view.options.fullCall+self.bet+base));
  return null;
}
export function chooseBotAction(view,random=Math.random) {
  const {self,options,street,board,players}=view;
  if(!options)throw new Error('No bot action available');
  const cfg=configs[self.kind]||configs.tag;
  const facing=options.fullCall>0;
  const toCall=options.toCall;
  const potOdds=facing?toCall/(view.pot+toCall):0;
  const count=players.filter(p=>p.inHand&&!p.folded&&p.index!==self.index).length;
  if(street==='preflop') {
    const score=chenScore(self.cards)+positionBonus(view);
    const adjusted=score-(facing&&options.fullCall>view.bigBlind?1.6:0);
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

export function coachSnapshot(engine) {
  const i=0,p=engine.players[i],opt=engine.legal(i);
  if(!opt) return {available:false,title:'Coach is ready',body:'When it is your turn, open Coach to review the exact betting math and an estimated showdown equity.'};
  const rivals=engine.players.filter(x=>x.inHand&&!x.folded&&x.index!==i);
  const fullCall=opt.fullCall, call=opt.toCall;
  const pot=engine.pot;
  const sidePotRisk=engine.players.some(x=>x.allIn&&x.inHand&&!x.folded);
  const potOdds=fullCall>0?call/(pot+call):0;
  const eq=equityMonteCarlo(p.cards,engine.board,Math.max(1,rivals.length),600);
  const score=chenScore(p.cards);
  const bbStack=p.stack/engine.bb;
  const effectiveBb=Math.min(p.stack+p.bet,...rivals.map(x=>x.stack+x.bet))/engine.bb;
  const bubble=engine.remaining===engine.prizes.length+1;
  const moneyStatus=engine.remaining<=engine.prizes.length?'In the money':bubble?'On the bubble':'Before the bubble';
  const per=round=>`${(round*100).toFixed(1)}%`;
  let takeaway;
  if(engine.stage==='preflop') {
    if(score>=13) takeaway='This is a strong starting-hand candidate; consider your position and previous raises before choosing a size.';
    else if(score>=9) takeaway='This hand is often playable, but position and the action before you are decisive.';
    else takeaway='This is a marginal starting hand; avoid assuming that suited cards or an ace automatically justify a call.';
    if(effectiveBb<12)takeaway+=' With fewer than 12 effective big blinds, push/fold strategy matters more than standard deep-stack raises.';
    else if(effectiveBb<25)takeaway+=' With a short-to-medium effective stack, watch your commitment to the pot.';
  } else if(fullCall===0)takeaway='Checking costs nothing. Whether betting is better depends on which worse hands call and which better hands fold.';
  else if(eq+0.02>=potOdds)takeaway='Equity versus random holdings exceeds the break-even call percentage, but the actual betting range may be much stronger.';
  else takeaway='Estimated random-hand equity is below the immediate pot-odds threshold. Folding may be reasonable, but implied odds and ranges matter.';
  return {
    available:true,title:'Tournament decision analysis',stage:engine.stage,pot,toCall:call,fullCall,potOdds,sidePotRisk,equity:eq.equity,confidence:`${eq.trials} Monte Carlo runouts`,opponents:rivals.length,score,
    bbStack,effectiveBb,moneyStatus,bubble,remaining:engine.remaining,
    exact:fullCall>0?(sidePotRisk?`Simple full-pot ratio: $${call} / $${pot+call} = ${per(potOdds)}. An all-in player may create side pots, so this may NOT be your actual break-even equity requirement.`:`Calling $${call} to compete for a resulting $${pot+call} pot requires ${per(potOdds)} equity to break even on an immediate call, assuming no future betting and no rake.`):`Checking is free. Minimum bet is ${engine.bb} chips.`,
    estimate:`Estimated showdown equity: ${per(eq.equity)} versus ${rivals.length} uniformly random opponent hand${rivals.length===1?'':'s'} (including split-pot shares).`,
    takeaway, caveat:'Tournament warning: chip equity is NOT prize equity (ICM). This is not an ICM calculation, push/fold chart, or solver-verified recommendation. Equity assumes random opponent cards, not betting ranges.'
  };
}