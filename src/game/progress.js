import { COMBINATIONS } from './engine.js';
import { DAILY_DICE, pairLeaders } from './session.js';
export const dayKey = (now=Date.now()) => { const d=new Date(now); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function initialProgress(now=Date.now(),legacy=[]) {
  const collection=Object.fromEntries(COMBINATIONS.map(c=>[c.id,0]));
  const seen=new Set();
  legacy.forEach(s=>{const id=s.sessionId||s.id;if(!id||seen.has(id))return;seen.add(id);Object.entries(s.combinationCounts||s.metrics?.combinationCounts||{}).forEach(([key,n])=>{if(Object.hasOwn(collection,key)&&Number.isSafeInteger(n)&&n>0)collection[key]+=n;});});
  const progress={schema:4,wallet:0,earnedDice:0,spentDice:0,collection,pairs:{},days:{},grants:[],cursors:{},createdAt:now,legacyImported:true};
  ensureDay(progress,now); return progress;
}
export function restoreProgress(saved,now=Date.now(),legacy=[]) {
  const dict=o=>o&&typeof o==='object'&&!Array.isArray(o),integer=n=>Number.isSafeInteger(n)&&n>=0;
  if(!saved||saved.schema!==4||!integer(saved.wallet)||!['collection','pairs','days','cursors'].every(k=>dict(saved[k]))
    ||!Array.isArray(saved.grants)||!saved.grants.every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d))
    ||!integer(saved.earnedDice)||!integer(saved.spentDice)||!Object.values(saved.collection).every(integer)
    ||!Object.values(saved.pairs).every(p=>p&&integer(p.attempts)&&integer(p.hits)&&p.hits<=p.attempts)
    ||!Object.values(saved.days).every(d=>d&&['earnedDice','spentDice','grant','actions'].every(k=>integer(d[k]))&&dict(d.combinationCounts)&&dict(d.pairs)))return initialProgress(now,legacy);
  return saved;
}
export function ensureDay(progress,now=Date.now()) {
  const key=dayKey(now);
  progress.days[key] ||= {earnedDice:0,spentDice:0,grant:0,combinationCounts:{},pairs:{},actions:0};
  let granted=0;
  if(!progress.grants.includes(key)){granted=DAILY_DICE;progress.wallet+=granted;progress.days[key].grant+=granted;progress.grants.push(key);}
  return {day:progress.days[key],key,granted};
}
export function applyProgress(progress,game,result,now=Date.now()) {
  const {day}=ensureDay(progress,now);
  if(!result?.eventId||result.type==='blocked')return false;
  const sequence=Number(result.eventId.slice(result.eventId.lastIndexOf('-e')+2));
  if(!Number.isInteger(sequence)||sequence<=(progress.cursors[game.id]??-1))return false;
  progress.cursors[game.id]=sequence;
  progress.wallet=game.diceCredits;
  const earned=result.earnedDice||0,cost=result.cost||0;
  progress.earnedDice+=earned;progress.spentDice+=cost;day.earnedDice+=earned;day.spentDice+=cost;
  if(result.type==='roll'||result.type==='drop')day.actions++;
  if(earned>0&&result.combo){const id=result.combo.id;progress.collection[id]=(progress.collection[id]||0)+1;day.combinationCounts[id]=(day.combinationCounts[id]||0)+1;}
  (result.pairTrials||[]).forEach(t=>{for(const store of [progress.pairs,day.pairs]){const row=store[t.key]||={attempts:0,hits:0};row.attempts++;row.hits+=Number(t.hit);}});
  return true;
}
export function todayProgress(progress,now=Date.now()) { const row=progress.days[dayKey(now)]||{earnedDice:0,spentDice:0,grant:0,combinationCounts:{},pairs:{},actions:0};return {...row,netDice:row.earnedDice-row.spentDice,...pairLeaders(row.pairs)}; }
