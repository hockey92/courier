// Who's in each crew: the gangsters for round n of a run (a block of the street, a turf in Brooklyn
// Heights), the kind each round introduces, and the tip shown when it does. Every fifth is Big Tony's.

export const DEBUT = { 2: 'runner', 3: 'bruiser', 4: 'thrower', 5: 'boss' };
export const TIPS = {
  runner: 'Runners drop in one hit, but they steal a heart and run. Knock them out to get it back',
  bruiser: 'Bruisers shrug off punches. Kick them, or stomp on their heads',
  thrower: 'Bottle throwers hang back. Dodge the bottles and close in',
  boss: "Big Tony's here! Sidestep his charge and he'll run into something",
};

// more of them, more kinds and more at once the further you get
export function wavePlan(n) {
  if (n % 5 === 0) {
    const visit = n / 5;
    return { list: ['boss', ...Array(visit).fill('thug')], max: 2, bossHp: 4 * (visit - 1) };
  }
  const pool = ['thug', 'thug'];
  if (n >= 2) pool.push('runner', 'runner');
  if (n >= 3) pool.push('bruiser');
  if (n >= 4) pool.push('thrower', 'thrower');
  const list = [];
  for (let i = 0, count = Math.min(3 + n, 12); i < count; i++) list.push(pool[Math.floor(Math.random() * pool.length)]);
  const debut = DEBUT[n];
  if (debut && !list.slice(0, 2).includes(debut)) list[1] = debut;
  return { list, max: Math.min(2 + Math.floor(n / 3), 4), bossHp: 0 };
}
