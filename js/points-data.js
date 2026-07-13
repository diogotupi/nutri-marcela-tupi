export const QUOTA_STRATEGIES = [
  { id: 'controlado', label: 'Mais Controlado', kcal: '~1.500 kcal', points: 15 },
  { id: 'moderado', label: 'Moderado', kcal: '~2.000 kcal', points: 20 },
  { id: 'flexivel', label: 'Mais Flexível', kcal: '~2.500 kcal', points: 25 },
];

export const MACRO_INFO = [
  { icon: '🍞', value: 4, label: 'Carboidrato', sub: 'kcal por grama' },
  { icon: '🍗', value: 4, label: 'Proteína', sub: 'kcal por grama' },
  { icon: '🥑', value: 9, label: 'Gordura', sub: 'kcal por grama', highlight: true },
];

export const FOOD_CATEGORIES = [
  {
    id: 'pizza',
    icon: '🍕',
    label: 'Pizza & Hambúrguer',
    items: [
      { id: 'pizza-fatia', name: 'Pizza (1 fatia)', pts: 3 },
      { id: 'pizza-2fatias', name: 'Pizza (2 fatias)', pts: 5 },
      { id: 'pizza-doce-fatia', name: 'Pizza doce (1 fatia)', pts: 4 },
      { id: 'hamburguer-simples', name: 'Hambúrguer simples', pts: 4 },
      { id: 'hamburguer-artesanal', name: 'Hambúrguer artesanal', pts: 6 },
      { id: 'hamburguer-duplo', name: 'Hambúrguer duplo', pts: 8 },
      { id: 'hot-dog', name: 'Hot dog completo', pts: 4 },
      { id: 'calzone', name: 'Calzone (1 pedaço)', pts: 4 },
      { id: 'esfiha-2', name: 'Esfiha (2 un.)', pts: 3 },
    ],
  },
  {
    id: 'churrasco',
    icon: '🍖',
    label: 'Churrasco, Japonesa & Massas',
    items: [
      { id: 'picanha-100', name: 'Picanha (100 g)', pts: 4 },
      { id: 'linguica-2', name: 'Linguiça (2 un.)', pts: 3 },
      { id: 'costela', name: 'Costela (porção média)', pts: 5 },
      { id: 'frango-churrasco', name: 'Frango assado (coxa/sobrecoxa)', pts: 3 },
      { id: 'sushi-8', name: 'Sushi (8 peças)', pts: 4 },
      { id: 'hot-roll-8', name: 'Hot roll (8 un.)', pts: 5 },
      { id: 'temaki', name: 'Temaki (1 un.)', pts: 4 },
      { id: 'macarrao-molho', name: 'Macarrão ao molho (prato médio)', pts: 4 },
      { id: 'lasanha', name: 'Lasanha (1 fatia)', pts: 5 },
      { id: 'feijoada', name: 'Feijoada (prato médio)', pts: 6 },
      { id: 'risoto', name: 'Risoto (prato médio)', pts: 5 },
    ],
  },
  {
    id: 'doces',
    icon: '🍩',
    label: 'Doces & Sobremesas',
    items: [
      { id: 'brigadeiro', name: 'Brigadeiro (1 un.)', pts: 2 },
      { id: 'chocolate-2', name: 'Chocolate (2 quadrados)', pts: 2 },
      { id: 'bombom', name: 'Bombom recheado', pts: 2 },
      { id: 'sorvete-bola', name: 'Bola de sorvete', pts: 2 },
      { id: 'pudim', name: 'Pudim (fatia pequena)', pts: 3 },
      { id: 'bolo-fatia', name: 'Fatia de bolo', pts: 4 },
      { id: 'brownie', name: 'Brownie', pts: 4 },
      { id: 'cheesecake', name: 'Fatia de cheesecake', pts: 6 },
      { id: 'sobremesa-extra', name: 'Sobremesa extra (torta/milkshake/sundae)', pts: 9 },
      { id: 'acai-medio', name: 'Açaí (copo médio com complementos)', pts: 5 },
      { id: 'waffle', name: 'Waffle com calda', pts: 5 },
    ],
  },
  {
    id: 'fastfood',
    icon: '🍗',
    label: 'Fast Food & Bebidas',
    items: [
      { id: 'batata-frita', name: 'Batata frita (porção média)', pts: 4 },
      { id: 'nuggets-6', name: 'Nuggets (6 un.)', pts: 4 },
      { id: 'pastel', name: 'Pastel (1 un.)', pts: 3 },
      { id: 'coxinha-2', name: 'Coxinha (2 un.)', pts: 3 },
      { id: 'empada', name: 'Empada (2 un.)', pts: 3 },
      { id: 'refrigerante', name: 'Refrigerante (350 ml)', pts: 2 },
      { id: 'suco-industrial', name: 'Suco industrializado (300 ml)', pts: 2 },
      { id: 'cerveja-lata', name: 'Cerveja (1 lata)', pts: 3 },
      { id: 'drink', name: 'Drink alcoólico (1 dose)', pts: 4 },
      { id: 'vinho-taca', name: 'Vinho (1 taça)', pts: 3 },
      { id: 'milkshake', name: 'Milkshake', pts: 5 },
    ],
  },
];

export const CORINGA_TYPES = [
  { id: 'leve', label: 'Leve', desc: 'grelhado, assado, natural', dot: 'green' },
  { id: 'moderado', label: 'Moderado', desc: 'um pouco de gordura/molho', dot: 'yellow' },
  { id: 'pesado', label: 'Pesado', desc: 'frito, cremoso, empanado', dot: 'red' },
];

export const CORINGA_SIZES = [
  { id: 'quarter', label: '1/4 do prato' },
  { id: 'half', label: 'Metade do prato' },
  { id: 'full', label: 'Prato cheio' },
];

/** Matriz tipo × porção → pontos */
export const CORINGA_MATRIX = {
  leve: { quarter: 2, half: 4, full: 6 },
  moderado: { quarter: 3, half: 6, full: 9 },
  pesado: { quarter: 5, half: 9, full: 14 },
};

export const IMPORTANT_RULES = [
  {
    title: 'Semana completa',
    text: 'Os pontos cobrem a semana inteira, não só o fim de semana. Qualquer desvio de segunda a sexta também consome pontos.',
  },
  {
    title: 'Durante a semana',
    text: 'Seguir a dieta normalmente, sem exceções.',
  },
  {
    title: 'Pontos = liberdade',
    text: 'Apenas para as refeições livres.',
  },
  {
    title: 'Estratégia, não perfeição',
    text: 'Não precisa ser perfeito, precisa ser estratégico.',
  },
  {
    title: 'O sistema coringa',
    text: 'É para estimar, não para justificar exageros — na dúvida, escolha a categoria mais alta.',
  },
];
