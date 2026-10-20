// Illustrative examples only. These values are NOT a TACO import or verified measures.
export const DEMO_FOODS = [
  ['demo-rice', 'Arroz', 'Cozido', 130, 'g', ['arroz branco']],
  ['demo-beans', 'Feijão', 'Cozido', 80, 'g', ['feijao carioca']],
  ['demo-banana', 'Banana', 'Crua', 90, 'g', []],
  ['demo-chicken', 'Frango', 'Assado', 180, 'g', ['peito de frango']],
  ['demo-juice', 'Suco de fruta', 'Pronto para beber', 45, 'ml', ['bebida']],
].map(([id, name, preparation, kcal, basis, aliases]) => ({ id, name, preparation, kcal, basis, aliases, measures: [], source: 'Dados ilustrativos', version: 'demo-1', illustrative: true, estimated: true }));
