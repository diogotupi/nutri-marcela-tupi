# Banco de Pontos: formatos da biblioteca

O produto ainda **não inclui a base oficial TACO**. Os cinco alimentos de exemplo são dados demonstrativos: não são atribuídos à TACO e não incluem medidas caseiras verificadas.

Para importar uma biblioteca, use JSON versionado neste formato:

```json
{
  "schemaVersion": 1,
  "source": "Nome e edição da fonte verificada",
  "version": "edição, publicação ou data de obtenção",
  "foods": [
    {
      "id": "fonte-arroz-cozido",
      "name": "Arroz",
      "preparation": "Cozido, sem óleo",
      "kcal": 128,
      "basis": "g",
      "aliases": ["arroz branco"],
      "measures": [],
      "illustrative": false,
      "estimated": false
    }
  ]
}
```

Os valores acima neste exemplo são fictícios e servem **somente para demonstrar o formato**. Não os importe como dados nutricionais. Cada item precisa de fonte, versão, forma de preparo, base `g` ou `ml`, lista de nomes alternativos e medidas verificadas. Uma medida caseira deve conter `name`, `grams`, `source` e `verified: true`; ela só é válida para base em gramas. Não converta volume em peso por aproximação.

Pontos por 100 g ou 100 ml = kcal da base × quantidade ÷ 100. O lançamento copia a energia, a base, a preparação, a fonte e a versão para preservar o histórico quando a biblioteca mudar. Todo o JSON importado passa por validação antes de substituir a biblioteca atual.

Os registros do banco são sincronizados em uma linha protegida por paciente. O paciente lê e altera a própria linha; a equipe administrativa pode consultar as linhas em modo de leitura. A coluna de revisão no banco evita sobrescritas entre dois dispositivos.
