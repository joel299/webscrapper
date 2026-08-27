import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate, scoreFreeText, scorePreset } from "../dist/search/relevance.js";

const candidate = (values) => ({ ...values });

test("IA exige sigla/expressão relevante e rejeita substring", () => {
  assert.equal(scoreFreeText(candidate({ titulo: "Projeto Floresta+ Amazônia" }), "IA").accepted, false);
  assert.equal(scoreFreeText(candidate({ titulo: "Solução de inteligência artificial generativa" }), "IA").accepted, true);
  assert.equal(scoreFreeText(candidate({ descricao: "Aquisição de vigilância e secretaria" }), "IA").accepted, false);
});

test("presets aceitam termos técnicos e rejeitam colisões", () => {
  assert.equal(scorePreset(candidate({ titulo: "Implantação de Power BI e data warehouse" }), "dados").accepted, true);
  assert.equal(scorePreset(candidate({ titulo: "Projeto de proteção ambiental" }), "ciberseguranca").accepted, false);
  assert.equal(scorePreset(candidate({ titulo: "Pontos de Cultura" }), "ust").accepted, false);
  assert.equal(scorePreset(candidate({ titulo: "Rede de cooperação" }), "hardware").accepted, false);
  assert.equal(scorePreset(candidate({ titulo: "Governança de TI e ITIL" }), "consultoria").accepted, true);
});

test("texto e preset são combinados com AND", () => {
  assert.equal(scoreCandidate(candidate({ titulo: "Firewall corporativo" }), "dados", "rede").accepted, false);
  assert.equal(scoreCandidate(candidate({ titulo: "Power BI para governança de dados" }), "dados", "Power BI").accepted, true);
});
