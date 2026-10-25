// Pure scoring rules. A selection is valid only when every selected die scores.
export function scoreDice(values) {
  if (!values.length) return { valid: false, points: 0, label: '' };
  const counts = Array(7).fill(0);
  values.forEach(v => counts[v]++);
  if (values.length === 6 && counts.slice(1).every(n => n === 1)) return { valid: true, points: 1500, label: 'Стрит!' };
  if (values.length === 6 && counts.filter(n => n === 2).length === 3) return { valid: true, points: 1500, label: 'Три пары!' };
  let points = 0;
  let groups = [];
  for (let face = 1; face <= 6; face++) {
    let n = counts[face];
    if (n >= 3) {
      points += (face === 1 ? 1000 : face * 100) * 2 ** (n - 3);
      groups.push(n === 3 ? 'Тройка' : n === 4 ? 'Каре!' : n === 5 ? 'Пять одинаковых!' : 'Шесть одинаковых!');
    } else if (face === 1 || face === 5) {
      points += n * (face === 1 ? 100 : 50);
    } else if (n) return { valid: false, points: 0, label: 'Эти кости не дают очков' };
  }
  return { valid: points > 0, points, label: groups[0] || (counts[1] && counts[5] ? 'Удачная пара' : counts[1] ? 'Единицы' : 'Пятёрки') };
}
export function bestSelection(dice) {
  let best = { indices: [], points: 0, label: '' };
  for (let mask = 1; mask < 1 << dice.length; mask++) {
    const indices = dice.map((_, i) => i).filter(i => mask & 1 << i);
    const score = scoreDice(indices.map(i => dice[i]));
    if (score.valid && (score.points > best.points || (score.points === best.points && indices.length > best.indices.length))) best = { indices, points: score.points, label: score.label };
  }
  return best;
}
export function randomDie(random = Math.random) { return Math.floor(random() * 6) + 1; }
export function bustProbability(count) {
  let busts = 0;
  const possibilities = 6 ** count;
  for (let n = 0; n < possibilities; n++) {
    let number = n;
    const values = Array.from({ length: count }, () => { const value = number % 6 + 1; number = Math.floor(number / 6); return value; });
    // Any one or five, triple, straight, or three pairs is a scoring roll.
    const counts = Array(7).fill(0);
    values.forEach(v => counts[v]++);
    if (!counts[1] && !counts[5] && !counts.some(c => c >= 3) && !(count === 6 && counts.filter(c => c === 2).length === 3)) busts++;
  }
  return Math.round(busts / possibilities * 100);
}
