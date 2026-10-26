import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { COMBINATIONS, PROBABILITY_TARGETS, evaluateBoard, probability, economy } from '../game/engine.js';
import { initialGame, restoreGame, rollGame, dropGame, lockTile, unlockTile, analyzeSession, finishGame, setTarget, checkpointGame } from '../game/session.js';
import { restoreProgress, ensureDay, applyProgress, todayProgress } from '../game/progress.js';

export const STORAGE_KEYS={save:'dnr-save-v4',sound:'dnr-domino-sound-v3',flow:'dnr-domino-flow-v3'};
const format=n=>new Intl.NumberFormat('ru-RU').format(n||0);
const percent=n=>`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:n>0&&n<.001?4:2}).format(n*100)}%`;
const signed=n=>`${n>=0?'+':'−'}${format(Math.abs(n))}`;
export function useDiceGame(){
  const storageAvailable=ref(true);
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  const loaded=read(STORAGE_KEYS.save,null),now=Date.now();
  const oldHistory=read('dnr-domino-history-v3',[]);
  const legacy=[...(Array.isArray(oldHistory)?oldHistory:[]),read('dnr-domino-session-v3',null)].filter(Boolean);
  const progress=reactive(restoreProgress(loaded?.progress,now,legacy));
  const daily=ensureDay(progress,now);
  const restored=restoreGame(loaded?.game,{wallet:progress.wallet,now});
  if(loaded?.game?.id===restored.id&&restored.phase==='active'&&Number.isFinite(loaded.savedAt))restored.pausedMs=(restored.pausedMs||0)+Math.max(0,now-loaded.savedAt);
  if(loaded?.game?.id===restored.id&&daily.granted)restored.grantedDice+=daily.granted;
  restored.diceCredits=progress.wallet;
  const game=reactive(restored);
  const history=ref((Array.isArray(loaded?.history)?loaded.history:[]).filter(s=>s&&typeof s.sessionId==='string'&&Number.isFinite(s.score)).slice(0,20));
  const archivedLogs=ref((Array.isArray(loaded?.logs)?loaded.logs:[]).filter(s=>s?.session?.schema===4).slice(0,3));
  const soundOn=ref(read(STORAGE_KEYS.sound,false)===true),autoFlow=ref(read(STORAGE_KEYS.flow,false)===true);
  const busy=ref(''),modal=ref(''),selectedCell=ref(null),probabilityAction=ref('roll'),toastMessage=ref(''),visualUpper=ref(null),analysis=ref(null),legendId=ref('single'),confetti=ref([]),clock=ref(now);
  const lastGain=ref(game.lastResult?.earnedDice||0),lastNet=ref(game.lastResult?.netDice||0);
  let pendingReport=!!loaded?.pendingReport,disposed=false,cosmeticTimer,flowTimer,dayTimer,resolveAnimation,audio,toastTimer,hiddenSince=null;
  const timers=new Set();
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);if(!disposed)fn();},ms);timers.add(id);return id;};
  const board=computed(()=>evaluateBoard(game.upper,game.lower)),quote=computed(()=>economy(game));
  const today=computed(()=>todayProgress(progress,clock.value));
  const selectedTarget=computed(()=>PROBABILITY_TARGETS.find(t=>t.id===game.target)||PROBABILITY_TARGETS[0]);
  const rollProbability=computed(()=>probability(game,'roll',game.target)),dropProbability=computed(()=>probability(game,'drop',game.target));
  const chosenProbability=computed(()=>probabilityAction.value==='roll'?rollProbability.value:dropProbability.value);
  const rawProbability=computed(()=>probability(game,probabilityAction.value,'any'));
  const ardor=computed(()=>quote.value.ardor);
  const canRoll=computed(()=>game.phase==='active'&&!busy.value&&quote.value.rollCost!==null&&game.diceCredits>=quote.value.rollCost);
  const canDrop=computed(()=>game.phase==='active'&&!busy.value&&quote.value.dropCost!==null&&game.diceCredits>=quote.value.dropCost);
  const flowPauseReason=computed(()=>autoFlow.value&&game.phase==='active'&&probability(game,'drop','any')===0?'Все верхние фишки уже оплачены. Сделай Roll для новых наград.':'');
  const activeTile=computed(()=>selectedCell.value?game[selectedCell.value.row]?.[selectedCell.value.index]:null);
  const lockOptions=computed(()=>selectedCell.value?.row==='upper'?[{duration:1,cost:1,label:'На 1 Roll'},{duration:3,cost:3,label:'На 3 Roll'}]:[{duration:3,cost:2,label:'На 3 Drop'},{duration:6,cost:4,label:'На 6 Drop'}]);
  const lastResult=computed(()=>game.lastResult);
  const hasAnalysisLog=computed(()=>analysis.value?.sessionId===game.id||archivedLogs.value.some(s=>s.sessionId===analysis.value?.sessionId));
  const legendCombo=computed(()=>COMBINATIONS.find(c=>c.id===legendId.value)||COMBINATIONS[0]);
  const targetPrize=computed(()=>quote.value.prizes.single+(game.target==='any'?0:quote.value.prizes[game.target]||0));
  const actionCost=computed(()=>probabilityAction.value==='roll'?quote.value.rollCost:quote.value.dropCost);
  const rollTitle=computed(()=>quote.value.rollCost===null?'Все верхние пары закреплены. Освободи одну бесплатно.':`Roll стоит ${quote.value.rollCost} дайсов из общего кошелька. Цена = округлённые вверх 600 / Ardor. Фиксации и удержанная комбинация уменьшают Ardor. Без награды потеряешь ${quote.value.rollCost}; любые награды начисляются в этот же кошелёк. Доступно ${quote.value.availableRolls} Roll.`);
  const dropTitle=computed(()=>quote.value.dropCost===null?'Все нижние пары закреплены. Освободи одну бесплатно.':`FIFO Drop стоит ${quote.value.dropCost} дайсов: максимум из 1 и числа закреплённых нижних пар (${quote.value.lowerLocks}). Первая свободная пара уходит, новая появляется справа. Ресурс общий с Roll. Шанс нового совпадения ${percent(probability(game,'drop','any'))}.`);

  function persist(reason='action'){
    const at=Date.now();
    if(game.rolls+game.drops+game.locksPurchased||game.phase==='finished'){
      const summary={...analyzeSession(game,at),final:game.phase==='finished',savedAt:at,snapshotReason:reason};
      history.value=[summary,...history.value.filter(s=>s.sessionId!==game.id)].slice(0,20);
      if(game.phase==='finished')archivedLogs.value=[{sessionId:game.id,savedAt:at,session:JSON.parse(JSON.stringify(game)),analysis:summary},...archivedLogs.value.filter(s=>s.sessionId!==game.id)].slice(0,3);
    }
    function write(){try{localStorage.setItem(STORAGE_KEYS.save,JSON.stringify({version:4,game,progress,history:history.value,logs:archivedLogs.value,pendingReport,savedAt:at}));return true;}catch{return false;}}
    let success=write();
    while(!success&&archivedLogs.value.length>1){archivedLogs.value.pop();success=write();}
    if(!success&&game.events.length>150){const removed=game.events.length-150;game.events.splice(0,removed);game.eventsDropped+=removed;success=write();}
    storageAvailable.value=success;
  }
  function syncDay(){clock.value=Date.now();const next=ensureDay(progress,clock.value);if(next.granted){game.diceCredits=progress.wallet;game.grantedDice+=next.granted;toast(`Новый день: +${format(next.granted)} дайсов. Выигрыши считаются отдельно.`);persist('daily');}}
  function checkpoint(reason){if(disposed)return;if(hiddenSince!==null&&['pagehide','unmount'].includes(reason)){if(game.phase==='active')game.pausedMs+=Math.max(0,Date.now()-hiddenSince);hiddenSince=null;}checkpointGame(game,reason);if(['pagehide','unmount'].includes(reason)&&game.metrics.actions)pendingReport=true;persist(reason);}
  function toast(text){toastMessage.value=text;clearTimeout(toastTimer);toastTimer=later(()=>{toastMessage.value='';},3600);}
  function sound(type){
    if(!soundOn.value)return;
    try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=type==='win'?[440,554,659,880]:type==='drop'?[330,440]:type==='lock'?[610]:[170,240,190,320];
      notes.forEach((frequency,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.065;o.type=type==='roll'?'triangle':'sine';o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.15);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.17);});}catch{}
  }
  function celebrate(){if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;confetti.value=Array.from({length:36},(_,id)=>({id,style:{left:`${Math.random()*100}%`,background:['#ffd47e','#7edbb2','#e8a6a0'][id%3],'--drift':`${Math.random()*200-100}px`,animationDelay:`${Math.random()*.4}s`}}));later(()=>{confetti.value=[];},3000);}
  const errorMessage=r=>({'finished':'Сессия завершена. Кошелёк сохранён — можно открыть новый стол.','no-dice':'Недостаточно дайсов. Освободи фиксации, чтобы снизить цену.','all-locked':'Все ячейки закреплены. Одну можно освободить бесплатно.','already-locked':'Ячейка уже закреплена.'}[r]||'Ход недоступен.');
  async function perform(action,{automatic=false}={}){
    if(busy.value||game.phase!=='active')return;
    syncDay();selectedCell.value=null;probabilityAction.value=action;
    const previousUpper=game.upper.map(t=>({...t}));
    const result=action==='roll'?rollGame(game):dropGame(game,{automatic});
    if(result.type==='blocked'){toast(errorMessage(result.reason));return;}
    applyProgress(progress,game,result);persist();busy.value=action;lastGain.value=0;lastNet.value=result.netDice;sound(action);
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if(action==='roll'){visualUpper.value=previousUpper;if(!reduced)cosmeticTimer=setInterval(()=>{visualUpper.value=previousUpper.map(t=>t.lockRemaining?t:{...t,a:Math.floor(Math.random()*6)+1,b:Math.floor(Math.random()*6)+1});},65);}
    await new Promise(resolve=>{resolveAnimation=resolve;later(resolve,reduced?30:action==='roll'?850:540);});
    clearInterval(cosmeticTimer);resolveAnimation=null;if(disposed)return;visualUpper.value=null;busy.value='';lastGain.value=result.earnedDice;
    if(result.earnedDice){sound('win');toast(`${result.combo.label} +${format(result.earnedDice)} дайсов · за ход ${signed(result.netDice)}`);if(result.earnedDice>=30)celebrate();}
    else toast(`Без нового совпадения: −${format(result.cost)} дайсов. Баланс ${format(game.diceCredits)}.`);
    if(game.phase==='finished')showAnalysis();
  }
  function selectCell(cell){if(busy.value||game.phase!=='active')return;selectedCell.value=selectedCell.value?.row===cell.row&&selectedCell.value.index===cell.index?null:cell;}
  function purchaseLock(duration){if(!selectedCell.value||busy.value)return;syncDay();const result=lockTile(game,selectedCell.value.row,selectedCell.value.index,duration);if(result.type==='blocked'){toast(errorMessage(result.reason));return;}applyProgress(progress,game,result);sound('lock');persist('lock');selectedCell.value=null;toast(`Фиксация −${result.cost}. Новый Roll: ${quote.value.rollCost??'освободи пару'}; Drop: ${quote.value.dropCost??'освободи пару'}.`);if(game.phase==='finished')showAnalysis();}
  function releaseLock(){if(!selectedCell.value||busy.value)return;unlockTile(game,selectedCell.value.row,selectedCell.value.index);persist('unlock');selectedCell.value=null;toast('Фиксация снята. Цена ходов и награды пересчитаны.');}
  function changeTarget(value){setTarget(game,value);persist('target');}
  function showAnalysis(){analysis.value=analyzeSession(game);modal.value='analysis';}
  function showLegend(id='single'){legendId.value=id;modal.value='legend';}
  function finish(){if(busy.value)return;finishGame(game,'manual');pendingReport=false;persist('finish');selectedCell.value=null;showAnalysis();}
  function requestFinish(){if(!busy.value){if(game.phase==='finished')showAnalysis();else modal.value='finish';}}
  function requestNew(){if(!busy.value){if(!game.metrics.actions&&!game.locksPurchased)startNew();else modal.value='new';}}
  function startNew(){if(busy.value)return;syncDay();if(game.phase==='active'&&(game.metrics.actions||game.locksPurchased)){finishGame(game,'restart');persist('restart');}Object.assign(game,initialGame({wallet:progress.wallet}));selectedCell.value=null;modal.value='';analysis.value=null;lastGain.value=0;lastNet.value=0;pendingReport=false;persist('new');}
  function preference(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{storageAvailable.value=false;}}
  function toggleSound(){soundOn.value=!soundOn.value;preference(STORAGE_KEYS.sound,soundOn.value);sound('lock');}
  function toggleAutoFlow(){autoFlow.value=!autoFlow.value;preference(STORAGE_KEYS.flow,autoFlow.value);toast(autoFlow.value?'Автопоток включён. Каждый Drop оплачивается по текущей цене.':'Автопоток остановлен.');}
  function exportLog(){const archived=modal.value==='analysis'&&analysis.value?.sessionId!==game.id?archivedLogs.value.find(s=>s.sessionId===analysis.value?.sessionId):null;if(modal.value==='analysis'&&analysis.value?.sessionId!==game.id&&!archived){toast('Осталась сводка; подробный журнал заменён более новыми.');return;}const source=archived?.session||game;const url=URL.createObjectURL(new Blob([JSON.stringify({version:4,session:source,analysis:archived?.analysis||analyzeSession(game),progress},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`dice-n-roll-${source.id}.json`;link.click();later(()=>URL.revokeObjectURL(url),1000);}
  function keydown(e){if(modal.value||e.ctrlKey||e.metaKey||e.altKey||e.repeat||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;if(e.target?.closest?.('button')&&(e.code==='Space'||e.key==='Enter'))return;if(e.code==='Space'||e.key.toLowerCase()==='r'){e.preventDefault();perform('roll');}else if(e.key.toLowerCase()==='d'){e.preventDefault();perform('drop');}else if(e.key==='Escape')selectedCell.value=null;}
  function visibility(){if(document.hidden){if(hiddenSince===null&&game.phase==='active'){checkpoint('hidden');hiddenSince=Date.now();}}else{if(hiddenSince!==null){if(game.phase==='active')game.pausedMs+=Math.max(0,Date.now()-hiddenSince);hiddenSince=null;}syncDay();}}
  const pagehide=()=>checkpoint('pagehide');
  onMounted(()=>{document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);window.addEventListener('beforeunload',pagehide);flowTimer=setInterval(()=>{if(autoFlow.value&&canDrop.value&&!flowPauseReason.value&&!modal.value&&!selectedCell.value&&!document.hidden)perform('drop',{automatic:true});},5000);dayTimer=setInterval(syncDay,60000);if(pendingReport&&game.metrics.actions){showAnalysis();pendingReport=false;}persist('open');});
  onBeforeUnmount(()=>{checkpoint('unmount');disposed=true;clearInterval(cosmeticTimer);clearInterval(flowTimer);clearInterval(dayTimer);timers.forEach(clearTimeout);timers.clear();resolveAnimation?.();audio?.close();document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);window.removeEventListener('beforeunload',pagehide);});
  return {game,progress,today,history,busy,modal,selectedCell,probabilityAction,toastMessage,visualUpper,lastGain,lastNet,storageAvailable,soundOn,autoFlow,flowPauseReason,confetti,analysis,hasAnalysisLog,board,quote,selectedTarget,rollProbability,dropProbability,chosenProbability,rawProbability,ardor,canRoll,canDrop,activeTile,lockOptions,lastResult,rollTitle,dropTitle,legendCombo,legendId,targetPrize,actionCost,COMBINATIONS,PROBABILITY_TARGETS,format,percent,signed,perform,selectCell,purchaseLock,releaseLock,changeTarget,showAnalysis,showLegend,finish,requestFinish,requestNew,startNew,toggleSound,toggleAutoFlow,exportLog};
}
