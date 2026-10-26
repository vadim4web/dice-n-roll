import { randomDie, evaluateBoard, matchBoard, fifoStep, probability, economy, rewardFor, pairKey, PROBABILITY_TARGETS } from './engine.js';

export const GAME_VERSION = 4;
export const DAILY_DICE = 120;
export const LOCK_OPTIONS = {
  upper: [{ duration: 1, cost: 1, label: '1 Roll' }, { duration: 3, cost: 3, label: '3 Roll' }],
  lower: [{ duration: 3, cost: 2, label: '3 Drop' }, { duration: 6, cost: 4, label: '6 Drop' }],
};
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
function makeTile(game, random, values = null) {
  return { id: `${game.id}-t${game.nextTileId++}`, a: values?.[0] ?? randomDie(random), b: values?.[1] ?? randomDie(random), suit: values?.[2] ?? Math.floor(random() * 4), lockRemaining: 0 };
}
export function initialGame({ random = Math.random, now = Date.now(), wallet = DAILY_DICE } = {}) {
  const game = { schema: 4, id: `dnr4-${now}-${Math.floor(random() * 1e8)}`, phase: 'active', upper: [], lower: [], nextTileId: 0, nextEventId: 0, eventsDropped: 0,
    diceCredits: wallet, walletStarted: wallet, grantedDice: 0, total: 0, spentDice: 0, rolls: 0, drops: 0, locksPurchased: 0, spentOnLocks: 0, startedAt: now, updatedAt: now, endedAt: null, pausedMs: 0, closedBalance: null,
    events: [], awardedUpperIds: [], target: 'any', lastResult: null, finishReason: null,
    metrics: { actions: 0, wins: 0, probabilitySum: 0, ardorSum: 0, dryStreak: 0, longestDryStreak: 0, automaticDrops: 0, combinationCounts: {}, pairs: {} } };
  const top = [[3,1,0],[5,1,1],[6,4,2],[1,5,0],[2,6,3],[2,5,2]];
  const bottom = [[2,3,2],[1,5,1],[2,3,0],[2,5,3],[3,4,1],[5,1,2]];
  game.upper = top.map(values => makeTile(game, random, values));
  game.lower = bottom.map(values => makeTile(game, random, values));
  game.awardedUpperIds = matchBoard(game.upper, game.lower).cards.map(card => card.id);
  game.lastResult = { type: 'ready', points: 0, earnedDice: 0, cost: 0, netDice: 0, newMatches: [], combo: evaluateBoard(game.upper, game.lower).combo };
  return game;
}
function validTile(t) { return t && typeof t.id === 'string' && [t.a,t.b].every(n => Number.isInteger(n) && n >= 1 && n <= 6) && Number.isInteger(t.suit) && t.suit >= 0 && t.suit <= 3 && nonnegative(t.lockRemaining) && t.lockRemaining <= 6; }
export function restoreGame(saved, options = {}) {
  if (!saved || saved.schema !== 4 || typeof saved.id !== 'string' || !['active','finished'].includes(saved.phase)
    || !['upper','lower'].every(row => Array.isArray(saved[row]) && saved[row].length === 6 && saved[row].every(validTile))
    || new Set([...saved.upper,...saved.lower].map(t => t.id)).size !== 12
    || !['nextTileId','nextEventId','eventsDropped','diceCredits','walletStarted','grantedDice','total','spentDice','rolls','drops','locksPurchased','spentOnLocks','startedAt','updatedAt'].every(k => nonnegative(saved[k]))
    || !Array.isArray(saved.events) || saved.events.length > 500 || saved.nextEventId !== saved.events.length + saved.eventsDropped
    || !saved.events.every((e,i) => e && e.id === `${saved.id}-e${saved.eventsDropped+i}` && typeof e.type === 'string' && nonnegative(e.at))
    || !Array.isArray(saved.awardedUpperIds) || !saved.awardedUpperIds.every(id => typeof id === 'string')
    || !PROBABILITY_TARGETS.some(t => t.id === saved.target) || !saved.metrics
    || !['actions','wins','dryStreak','longestDryStreak','automaticDrops'].every(k => nonnegative(saved.metrics[k]))
    || !['probabilitySum','ardorSum'].every(k => Number.isFinite(saved.metrics[k]) && saved.metrics[k] >= 0)
    || !saved.metrics.combinationCounts || typeof saved.metrics.combinationCounts !== 'object' || !Object.values(saved.metrics.combinationCounts).every(nonnegative)
    || !saved.metrics.pairs || typeof saved.metrics.pairs !== 'object' || !Object.values(saved.metrics.pairs).every(p=>p&&nonnegative(p.attempts)&&nonnegative(p.hits)&&p.hits<=p.attempts)
    || !nonnegative(saved.pausedMs) || (saved.closedBalance!==null&&!nonnegative(saved.closedBalance))
    || (saved.endedAt !== null && !nonnegative(saved.endedAt))) return initialGame(options);
  return saved;
}
function event(game,type,now,data={}) {
  game.updatedAt = now;
  const entry = { id: `${game.id}-e${game.nextEventId++}`, type, at: now, target: game.target, points: data.earnedDice || 0, earnedDice: data.earnedDice || 0, cost: data.cost || 0, total: game.total, diceCredits: game.diceCredits, ...data };
  game.events.push(entry);
  if (game.events.length > 500) { const n = game.events.length-500; game.events.splice(0,n); game.eventsDropped += n; }
  return entry;
}
const blocked = (reason, cost = 0) => ({ type: 'blocked', reason, cost, points: 0, earnedDice: 0 });
function outcome(game,type,now,quote,chance,anyChance,cost,walletBefore,details={}) {
  const board = evaluateBoard(game.upper,game.lower);
  const paid = new Set(game.awardedUpperIds);
  const newMatches = board.matches.filter(m => !paid.has(m.upperId));
  const fresh = new Set(newMatches.map(m => m.upperId));
  const trials = game.upper.filter(tile => !paid.has(tile.id)).map(tile => ({ key: pairKey(tile), hit: fresh.has(tile.id) }));
  trials.forEach(trial => { const row = game.metrics.pairs[trial.key] ||= { attempts: 0, hits: 0 }; row.attempts++; row.hits += Number(trial.hit); });
  newMatches.forEach(m => paid.add(m.upperId));
  game.awardedUpperIds = game.upper.filter(t => paid.has(t.id)).map(t => t.id);
  const earnedDice = rewardFor(board.combo,newMatches.length,quote);
  game.diceCredits += earnedDice; game.total += earnedDice; game.spentDice += cost;
  game.metrics.actions++; game.metrics.probabilitySum += chance; game.metrics.ardorSum += quote.ardor;
  if (type === 'drop' && details.automatic) game.metrics.automaticDrops++;
  if (earnedDice) { game.metrics.wins++; game.metrics.dryStreak=0; game.metrics.combinationCounts[board.combo.id]=(game.metrics.combinationCounts[board.combo.id]||0)+1; }
  else { game.metrics.dryStreak++; game.metrics.longestDryStreak=Math.max(game.metrics.longestDryStreak,game.metrics.dryStreak); }
  const result = { type, points: earnedDice, earnedDice, cost, netDice: earnedDice-cost, walletBefore, walletAfter: game.diceCredits, newMatches, combo: board.combo,
    probability: chance, winProbability: anyChance, ardor: quote.ardor, prizes: quote.prizes, pairTrials: trials, ...details };
  const entry = event(game,type,now,{ ...result, details: { ...details, newMatchCount:newMatches.length, combination:board.combo.id, upper:game.upper.map(t=>({...t})), lower:game.lower.map(t=>({...t})) } });
  result.eventId=entry.id;
  game.lastResult=result;
  if (game.diceCredits === 0) { finishGame(game,'bankrupt',now); result.finished=true; }
  return result;
}
export function rollGame(game,{random=Math.random,now=Date.now()}={}) {
  if (game.phase==='finished') return blocked('finished');
  const quote=economy(game),cost=quote.rollCost;
  if (cost===null) return blocked('all-locked');
  if (game.diceCredits<cost) return blocked('no-dice',cost);
  const chance=probability(game,'roll'),anyChance=probability(game,'roll','any'),before=game.diceCredits;
  game.diceCredits-=cost;
  game.upper=game.upper.map(t=>t.lockRemaining>0?{...t,lockRemaining:t.lockRemaining-1}:makeTile(game,random));
  game.rolls++;
  return outcome(game,'roll',now,quote,chance,anyChance,cost,before);
}
export function dropGame(game,{random=Math.random,now=Date.now(),automatic=false}={}) {
  if (game.phase==='finished') return blocked('finished');
  const quote=economy(game),cost=quote.dropCost;
  if (cost===null) return blocked('all-locked');
  if (game.diceCredits<cost) return blocked('no-dice',cost);
  const chance=probability(game,'drop'),anyChance=probability(game,'drop','any'),before=game.diceCredits;
  game.diceCredits-=cost;
  const next=fifoStep(game.lower,makeTile(game,random));
  game.lower=next.lower.map(t=>t.lockRemaining>0?{...t,lockRemaining:t.lockRemaining-1}:t); game.drops++;
  return outcome(game,'drop',now,quote,chance,anyChance,cost,before,{automatic,removedId:next.removed.id,insertedId:next.inserted.id});
}
export function lockTile(game,row,index,duration,{now=Date.now()}={}) {
  if (game.phase==='finished') return blocked('finished');
  if (!LOCK_OPTIONS[row] || !Number.isInteger(index) || index<0 || index>5) return blocked('invalid-lock');
  const offer=LOCK_OPTIONS[row].find(o=>o.duration===duration);
  if (!offer) return blocked('invalid-lock');
  if (game[row][index].lockRemaining) return blocked('already-locked');
  if (game.diceCredits<offer.cost) return blocked('no-dice',offer.cost);
  game[row][index].lockRemaining=duration; game.diceCredits-=offer.cost; game.spentDice+=offer.cost; game.spentOnLocks+=offer.cost; game.locksPurchased++;
  const entry=event(game,'lock',now,{cost:offer.cost,details:{row,index,duration,tileId:game[row][index].id}});
  if (game.diceCredits===0) finishGame(game,'bankrupt',now);
  return {type:'lock',cost:offer.cost,earnedDice:0,points:0,netDice:-offer.cost,eventId:entry.id,row,index,duration};
}
export function unlockTile(game,row,index,{now=Date.now()}={}) {
  if (game.phase==='finished') return blocked('finished');
  if (!LOCK_OPTIONS[row] || !Number.isInteger(index) || index<0 || index>5) return blocked('invalid-lock');
  if (!game[row][index].lockRemaining) return blocked('not-locked');
  game[row][index].lockRemaining=0; event(game,'unlock',now,{details:{row,index,tileId:game[row][index].id}});
  return {type:'unlock',cost:0,earnedDice:0,points:0};
}
export function setTarget(game,target,{now=Date.now()}={}) {
  if (!PROBABILITY_TARGETS.some(t=>t.id===target)) return blocked('invalid-target');
  if (game.target===target) return {type:'noop'};
  game.target=target; event(game,'target',now,{details:{target}}); return {type:'target'};
}
export function checkpointGame(game,reason='pagehide',now=Date.now()) { return game.phase==='finished'?{type:'noop'}:event(game,'checkpoint',now,{details:{reason}}); }
export function finishGame(game,reason='manual',now=Date.now()) {
  if (game.phase!=='finished') { game.phase='finished'; game.endedAt=now; game.closedBalance=game.diceCredits; game.finishReason=reason; event(game,'finish',now,{details:{reason}}); }
  return analyzeSession(game,now);
}
export function pairLeaders(pairs) {
  const list=Object.entries(pairs).map(([key,p])=>({key,...p,rate:p.attempts?p.hits/p.attempts:0}));
  return { lucky:list.filter(p=>p.hits>0).sort((a,b)=>b.rate-a.rate||b.hits-a.hits).slice(0,3), unlucky:list.filter(p=>p.attempts>p.hits).sort((a,b)=>a.rate-b.rate||b.attempts-a.attempts).slice(0,3) };
}
export function analyzeSession(game,now=Date.now()) {
  const m=game.metrics,dropShare=m.actions?game.drops/m.actions:0;
  const playStyle=!m.actions?'observer':game.locksPurchased>=Math.max(2,m.actions/4)?'strategist':dropShare>=.6?'patient':'balanced';
  const names={observer:['Наблюдатель','Пока недостаточно ходов для сравнения.'],strategist:['Стратег','Ты покупал контроль над полем и удерживал нужные пары.'],patient:['Мастер потока','Ты чаще использовал нижнюю карусель.'],balanced:['Свободный игрок',game.drops?'Ты сочетал прокрутки и сдвиги.':'Ты обновлял верхние барабаны.']};
  return {sessionId:game.id,startedAt:game.startedAt,endedAt:game.endedAt,durationMs:Math.max(0,(game.endedAt??now)-game.startedAt-(game.pausedMs||0)),score:game.total,earnedDice:game.total,spentDice:game.spentDice,netDice:game.total-game.spentDice,balance:game.closedBalance??game.diceCredits,
    rolls:game.rolls,drops:game.drops,actions:m.actions,lockCount:game.locksPurchased,spentOnLocks:game.spentOnLocks,wins:m.wins,hitRate:m.actions?m.wins/m.actions:0,meanProbability:m.actions?m.probabilitySum/m.actions:0,meanArdor:m.actions?m.ardorSum/m.actions:0,longestDryStreak:m.longestDryStreak,dropShare,automaticDrops:m.automaticDrops,manualDrops:game.drops-m.automaticDrops,
    playStyle,label:names[playStyle][0],description:names[playStyle][1],combinationCounts:{...m.combinationCounts},pairs:JSON.parse(JSON.stringify(m.pairs)),...pairLeaders(m.pairs),eventsDropped:game.eventsDropped,reason:game.finishReason};
}
