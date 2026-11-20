/* ROLL'EM — game modes and the topic of each category (new packs may also set `topic` directly). */
window.ROLLEM_MODES = [
  { id: 'all', name: 'Unlimited', icon: '🎲', desc: 'Every category, all mixed together' },
  { id: 'food', name: 'Food & Drink', icon: '🍕', desc: 'Snacks, sweets, drinks and dinner' },
  { id: 'nature', name: 'Animals & Nature', icon: '🦁', desc: 'Creatures, plants and the great outdoors' },
  { id: 'people', name: 'People & Places', icon: '🌎', desc: 'Names, jobs, cities and landmarks' },
  { id: 'pop', name: 'Pop Culture', icon: '🎬', desc: 'Movies, TV, music, games and sports' },
  { id: 'home', name: 'Home & Everyday', icon: '🏠', desc: 'Stuff in your house, car and bag' },
  { id: 'life', name: 'Life & Occasions', icon: '🎉', desc: 'Holidays, parties and daily life' },
  { id: 'words', name: 'Describe It', icon: '✨', desc: 'Hot, cold, sharp, sticky, and more' },
  { id: 'after_dark', name: 'After Dark', icon: '🌙', desc: 'Bars, dates, bad habits. Grown-ups only', badge: 'PG-13' }
];
window.ROLLEM_TOPIC = (function () {
  const t = {
    food: 'fruit vegetable breakfast pizza_topping dessert drink snack restaurant_order candy fridge grocery',
    nature: 'animal pet bird sea bug nature plant beach weather_sky zoo park farm space forest dog_breed camping',
    people: 'country city vacation boy_name girl_name job famous_person town_place airport nickname hotel hospital',
    pop: 'character sport hobby brand toy movie tv_show musician stadium cinema app car_brand',
    home: 'kitchen school clothing bathroom house car vehicle office garage backpack bedroom backyard chore plug_in suitcase',
    life: 'birthday carnival christmas halloween wedding summer gift gym vacation_do bored kids_love forget lose happy bedtime road_trip',
    words: 'family_word verb body_part cold hot round soft loud fast red smells_good scary morning metal wood sticky small big sharp'
  };
  const map = {};
  Object.keys(t).forEach(k => t[k].split(' ').forEach(id => (map[id] = k)));
  return map;
})();
