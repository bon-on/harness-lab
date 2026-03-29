import { readFileSync } from 'node:fs';

type HarnessSpec = {
  name: string;
  description?: string;
  variants: VariantSpec[];
  cases: CaseSpec[];
};

type VariantSpec = {
  id: string;
  system: string;
  developer?: string;
  userTemplate: string;
};

type CaseSpec = {
  id: string;
  variables: Record<string, string>;
  mockOutput: Record<string, string>;
  checks: CheckSpec[];
};

type CheckSpec =
  | { type: 'includesAll'; values: string[]; weight?: number }
  | { type: 'excludesAll'; values: string[]; weight?: number }
  | { type: 'maxLength'; value: number; weight?: number };

type VariantResult = {
  variantId: string;
  score: number;
  maxScore: number;
  details: string[];
  renderedPrompt: string;
};

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => variables[key] ?? '');
}

function evaluateOutput(output: string, checks: CheckSpec[]) {
  let score = 0;
  let maxScore = 0;
  const details: string[] = [];

  for (const check of checks) {
    const weight = check.weight ?? 1;
    maxScore += weight;

    if (check.type === 'includesAll') {
      const missing = check.values.filter((value) => !output.toLowerCase().includes(value.toLowerCase()));
      if (missing.length === 0) {
        score += weight;
        details.push(`✅ includesAll: ${check.values.join(', ')}`);
      } else {
        details.push(`❌ missing: ${missing.join(', ')}`);
      }
    }

    if (check.type === 'excludesAll') {
      const found = check.values.filter((value) => output.toLowerCase().includes(value.toLowerCase()));
      if (found.length === 0) {
        score += weight;
        details.push(`✅ excludesAll: ${check.values.join(', ')}`);
      } else {
        details.push(`❌ found forbidden: ${found.join(', ')}`);
      }
    }

    if (check.type === 'maxLength') {
      if (output.length <= check.value) {
        score += weight;
        details.push(`✅ maxLength <= ${check.value}`);
      } else {
        details.push(`❌ too long: ${output.length}/${check.value}`);
      }
    }
  }

  return { score, maxScore, details };
}

function loadSpec(filePath: string): HarnessSpec {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HarnessSpec;
}

function run(spec: HarnessSpec) {
  console.log(`\n🧪 ${spec.name}`);
  if (spec.description) console.log(spec.description);
  console.log('');

  for (const testCase of spec.cases) {
    console.log(`=== CASE: ${testCase.id} ===`);
    const results: VariantResult[] = [];

    for (const variant of spec.variants) {
      const renderedPrompt = [
        `SYSTEM:\n${variant.system}`,
        variant.developer ? `DEVELOPER:\n${variant.developer}` : '',
        `USER:\n${renderTemplate(variant.userTemplate, testCase.variables)}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      const output = testCase.mockOutput[variant.id];
      const evaluated = evaluateOutput(output, testCase.checks);

      results.push({
        variantId: variant.id,
        score: evaluated.score,
        maxScore: evaluated.maxScore,
        details: evaluated.details,
        renderedPrompt,
      });
    }

    results
      .sort((a, b) => b.score - a.score)
      .forEach((result) => {
        console.log(`\n▶ Variant: ${result.variantId}`);
        console.log(`Score: ${result.score}/${result.maxScore}`);
        for (const detail of result.details) console.log(`  ${detail}`);
      });

    const winner = results[0];
    console.log(`\n🏆 Winner for ${testCase.id}: ${winner.variantId}`);
    console.log('Prompt preview:');
    console.log(winner.renderedPrompt.split('\n').slice(0, 8).join('\n'));
    console.log('');
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: harness-lab <spec.json>');
  process.exit(1);
}

run(loadSpec(filePath));
