import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { collectEvidence, checkEvidence } from './evidence.js';
import { installKit, rollbackKit, resolveKitRoot, type KitResult } from './lifecycle.js';

const toolVersion: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

type OutputFormat = 'text' | 'json' | 'md';
type WorkflowPattern =
  | 'pipeline'
  | 'fanout-fanin'
  | 'expert-pool'
  | 'generate-verify'
  | 'supervisor'
  | 'hierarchical';

type HarnessSpec = {
  name: string;
  description?: string;
  workflow?: WorkflowSpec;
  variants: VariantSpec[];
  cases: CaseSpec[];
  skills?: SkillSpec[];
  artifacts?: ArtifactSpec[];
  qualityGates?: QualityGateSpec[];
  maturityEvidence?: Partial<MaturityEvidenceSpec>;
};

type WorkflowSpec = {
  pattern: WorkflowPattern;
  objective?: string;
  orchestration?: OrchestrationSpec;
};

type OrchestrationSpec = {
  handoff?: string;
  reviewLoop?: string;
  escalation?: string;
  retryPolicy?: string;
  verification?: string;
};

type VariantSpec = {
  id: string;
  label?: string;
  system: string;
  developer?: string;
  userTemplate: string;
  agents?: AgentSpec[];
  skills?: string[];
  orchestration?: OrchestrationSpec;
};

type AgentSpec = {
  id: string;
  role: string;
  responsibilities: string[];
  systemPrompt?: string;
  developerPrompt?: string;
  expectedOutputs?: string[];
};

type SkillSpec = {
  id: string;
  description: string;
  appliesTo?: string[];
};

type ArtifactSpec = {
  id: string;
  type: 'plan' | 'design-note' | 'eval-report' | 'review-response' | 'runbook' | 'test-evidence';
  required: boolean;
  description: string;
};

type QualityGateSpec =
  | { type: 'tests-required'; weight?: number; description?: string }
  | { type: 'structured-output'; weight?: number; description?: string }
  | { type: 'documented-plan'; weight?: number; description?: string }
  | { type: 'reviewer-loop'; weight?: number; description?: string }
  | { type: 'escalation-defined'; weight?: number; description?: string };

type MaturityEvidenceSpec = {
  plansVersioned: boolean;
  docsVersioned: boolean;
  reusableHarnessPatterns: boolean;
  rolesDefined: boolean;
  evalCasesRepeatable: boolean;
  scoringRubricDefined: boolean;
  reportsGenerated: boolean;
  qualityGatesAutomated: boolean;
  structuralGuardrails: boolean;
  reviewLoopEncoded: boolean;
  escalationPolicyDefined: boolean;
  recoveryWorkflowDefined: boolean;
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

type AxisKey = 'documentation' | 'structure' | 'evaluation' | 'guardrails' | 'autonomy';

type AxisScore = {
  axis: AxisKey;
  label: string;
  score: number;
  maxScore: number;
  level: number;
  evidence: string[];
  gaps: string[];
  nextStep: string;
};

type VariantCaseResult = {
  variantId: string;
  variantLabel: string;
  score: number;
  maxScore: number;
  details: string[];
  renderedPrompt: string;
  output: string;
  categoryScores: Record<string, { score: number; maxScore: number }>;
};

type CaseRunResult = {
  caseId: string;
  winner: VariantCaseResult;
  results: VariantCaseResult[];
};

type RunReport = {
  evaluationMode?: 'mock';
  agentExecuted?: false;
  specName: string;
  workflowPattern: WorkflowPattern | 'unspecified';
  summary: {
    totalCases: number;
    totalVariants: number;
    overallWinner: string;
  };
  cases: CaseRunResult[];
  ranking: Array<{ variantId: string; variantLabel: string; score: number; maxScore: number }>;
  recommendations: string[];
};

type MaturityAssessmentResult = {
  specName: string;
  totalScore: number;
  maxScore: number;
  level: number;
  levelLabel: string;
  axes: AxisScore[];
  strengths: string[];
  priorities: string[];
};

type CliOptions = {
  format: OutputFormat;
  output?: string;
  apply?: boolean;
  dryRun?: boolean;
};

type EnforcementMode = 'warn-block-critical' | 'strict-block' | 'advisory';

type RepoHarnessManifest = {
  version: string;
  repoName: string;
  description?: string;
  policyMode: EnforcementMode;
  stackSummary?: string;
  sourcePriority: string[];
  detectedProfiles?: string[];
  suggestedPacks?: string[];
  approvedPacks?: string[];
  detectedSignals?: DetectionSignal[];
  paths: {
    rulesDir: string;
    specsDir: string;
    adrsDir: string;
    contractsDir: string;
    templatesDir: string;
    reportsDir: string;
  };
  requiredFiles: string[];
  criticalChecks: string[];
};

type DetectionSignal = {
  kind: 'language' | 'framework' | 'tooling' | 'test' | 'ci' | 'runtime';
  path: string;
  detail: string;
  confidence: number;
};

type ProjectProfilePack = {
  id: string;
  label: string;
  summary: string;
  goldenRuleSuggestions: string[];
  constraintSuggestions: string[];
  featureSpecHints: string[];
  contractHints: string[];
  auditRecommendations: string[];
  auditKeywords: string[];
};

type DetectResult = {
  repoRoot: string;
  stackSummary: string;
  detectedProfiles: string[];
  suggestedPacks: string[];
  signals: DetectionSignal[];
  packs: ProjectProfilePack[];
};

type ParsedMarkdownDoc = {
  path: string;
  frontmatter: Record<string, string | string[]>;
  sections: Record<string, string>;
  raw: string;
};

type AuditFinding = {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
};

type AuditResult = {
  repoName: string;
  manifestPath: string;
  policyMode: EnforcementMode;
  blocked: boolean;
  stackSummary?: string;
  detectedProfiles?: string[];
  approvedPacks?: string[];
  summary: {
    specs: number;
    adrs: number;
    contracts: number;
    critical: number;
    warnings: number;
    info: number;
  };
  findings: AuditFinding[];
};

type PlanResult = {
  specPath: string;
  title: string;
  status: string;
  relatedAdrs: Array<{ id: string; title: string; status: string; path: string }>;
  relatedContracts: Array<{ id: string; title: string; status: string; path: string }>;
  acceptanceCriteria: string[];
  constraints: string[];
  requiredEvidence: string[];
  blockers: string[];
  executionOrder: string[];
};

const workflowPatterns: WorkflowPattern[] = [
  'pipeline',
  'fanout-fanin',
  'expert-pool',
  'generate-verify',
  'supervisor',
  'hierarchical',
];

const maturityLevelLabels = [
  '',
  'Level 1 Initial',
  'Level 2 Repeatable',
  'Level 3 Structured',
  'Level 4 Automated',
  'Level 5 Agentic',
];

const profilePacks: Record<string, ProjectProfilePack> = {
  'nextjs-frontend': {
    id: 'nextjs-frontend',
    label: 'Next.js Frontend',
    summary: 'SSR/SSG-aware frontend pack for Next.js applications.',
    goldenRuleSuggestions: [
      'Preserve Next.js server/client component boundaries and do not move logic across them casually.',
      'Treat routing, rendering mode, and cache behavior as explicit design decisions, not incidental implementation details.',
    ],
    constraintSuggestions: [
      'Follow existing Next.js routing conventions such as app router or pages router already present in the repo.',
      'Verify typecheck, lint, and production build behavior before considering frontend changes complete.',
      'Document data fetching, caching, and server action behavior in the feature spec when those paths change.',
    ],
    featureSpecHints: [
      'Call out route segments, rendering mode, and data fetching path affected by the change.',
      'List responsive behavior and browser-facing acceptance criteria when UI or navigation changes.',
    ],
    contractHints: [
      'Include done criteria for route rendering, client interactivity, and build-safe imports.',
      'Include verification steps for lint, typecheck, and production build.',
    ],
    auditRecommendations: [
      'Warn when approved Next.js packs are present but rules do not mention routing/rendering/build constraints.',
    ],
    auditKeywords: ['next.js', 'nextjs', 'app router', 'pages router', 'server component', 'client component', 'next build'],
  },
  'react-frontend': {
    id: 'react-frontend',
    label: 'React Frontend',
    summary: 'SPA/frontend pack for React-based client applications.',
    goldenRuleSuggestions: [
      'Preserve existing state-management and component-boundary patterns unless the spec explicitly changes them.',
      'Treat accessibility and responsive behavior as first-class acceptance criteria for UI work.',
    ],
    constraintSuggestions: [
      'Use the repo’s existing React runtime, router, and testing conventions rather than introducing parallel patterns.',
      'Verify typecheck, lint, and the primary frontend test path before closing work.',
    ],
    featureSpecHints: [
      'State affected views, state transitions, and interaction acceptance criteria.',
    ],
    contractHints: [
      'Include done criteria for interaction flows and non-regression of critical views.',
    ],
    auditRecommendations: [
      'Warn when approved React frontend packs are present but UI-specific constraints are absent.',
    ],
    auditKeywords: ['react', 'component', 'frontend', 'ui', 'typecheck', 'lint'],
  },
  'kotlin-spring-backend': {
    id: 'kotlin-spring-backend',
    label: 'Kotlin Spring Backend',
    summary: 'Backend pack for Kotlin services built on Spring Boot.',
    goldenRuleSuggestions: [
      'Preserve Spring configuration, bean lifecycle, and transaction boundaries unless the spec explicitly changes them.',
      'Treat API compatibility, observability, and failure semantics as explicit acceptance criteria for backend work.',
    ],
    constraintSuggestions: [
      'Respect existing Gradle task structure and Spring profile conventions already used by the service.',
      'Document database, configuration, and API surface changes in the feature spec and ADR when applicable.',
      'Verify test tasks and application startup path expected by the repo before closing backend changes.',
    ],
    featureSpecHints: [
      'Call out API contracts, persistence impact, config/profile changes, and operational risk.',
    ],
    contractHints: [
      'Include done criteria for endpoint behavior, persistence effects, and startup/test verification.',
    ],
    auditRecommendations: [
      'Warn when approved Kotlin Spring backend packs are present but rules do not mention Gradle, profiles, or operational verification.',
    ],
    auditKeywords: ['kotlin', 'spring', 'spring boot', 'gradle', 'profile', 'actuator', 'backend'],
  },
  'kotlin-ktor-backend': {
    id: 'kotlin-ktor-backend',
    label: 'Kotlin Ktor Backend',
    summary: 'Backend pack for Kotlin services built on Ktor.',
    goldenRuleSuggestions: [
      'Preserve request pipeline, plugin configuration, and coroutine behavior unless the spec explicitly changes them.',
      'Treat HTTP contract, serialization, and operational behavior as first-class acceptance criteria.',
    ],
    constraintSuggestions: [
      'Respect existing Gradle/Ktor module structure and environment configuration.',
      'Verify test tasks and application startup behavior used by the service before closing work.',
    ],
    featureSpecHints: [
      'Call out route handlers, serialization changes, and runtime configuration touched by the change.',
    ],
    contractHints: [
      'Include done criteria for route behavior, serialization, and startup/test verification.',
    ],
    auditRecommendations: [
      'Warn when approved Ktor backend packs are present but rules do not mention request pipeline or Gradle verification.',
    ],
    auditKeywords: ['kotlin', 'ktor', 'gradle', 'backend', 'routing', 'serialization'],
  },
};

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => variables[key] ?? '');
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const options: CliOptions = { format: 'text' };
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (value === '--apply' || value === '--dry-run') {
      if (value === '--apply') options.apply = true;
      else options.dryRun = true;
      continue;
    }
    if (value === '--format') {
      const next = rest[++index];
      if (next !== 'text' && next !== 'json' && next !== 'md') throw new Error(`Invalid --format value: ${next ?? '(missing)'}`);
      options.format = next;
      continue;
    }
    if (value === '--output') {
      const next = rest[++index];
      if (!next || next.startsWith('--')) throw new Error('Missing value for --output');
      options.output = next;
      continue;
    }
    if (value.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    positionals.push(value);
  }
  if (options.apply && options.dryRun) throw new Error('--apply and --dry-run cannot be combined');
  if (options.apply && !['adopt', 'update', 'rollback'].includes(command)) throw new Error('--apply is supported only for adopt, update and rollback');
  if (options.dryRun && !['init', 'update', 'rollback'].includes(command)) throw new Error('--dry-run is supported only for init, update and rollback');
  return { command, positionals, options };
}

function readJsonFile<T>(filePath: string): T {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function readTextIfExists(filePath: string) {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateSpec(spec: HarnessSpec) {
  assert(spec.name, 'Spec must include name');
  assert(Array.isArray(spec.variants) && spec.variants.length > 0, 'Spec must include at least one variant');
  assert(Array.isArray(spec.cases) && spec.cases.length > 0, 'Spec must include at least one case');

  if (spec.workflow) {
    assert(
      workflowPatterns.includes(spec.workflow.pattern),
      `workflow.pattern must be one of: ${workflowPatterns.join(', ')}`,
    );
  }

  for (const variant of spec.variants) {
    assert(variant.id, 'Each variant must include id');
    assert(variant.system, `Variant ${variant.id} must include system`);
    assert(variant.userTemplate, `Variant ${variant.id} must include userTemplate`);
  }

  for (const testCase of spec.cases) {
    assert(testCase.id, 'Each case must include id');
    assert(testCase.mockOutput, `Case ${testCase.id} must include mockOutput`);
    assert(Array.isArray(testCase.checks), `Case ${testCase.id} must include checks`);
  }
}

function evaluateOutput(output: string, checks: CheckSpec[]) {
  let score = 0;
  let maxScore = 0;
  const details: string[] = [];
  const categoryScores: Record<string, { score: number; maxScore: number }> = {
    output: { score: 0, maxScore: 0 },
  };

  for (const check of checks) {
    const weight = check.weight ?? 1;
    maxScore += weight;
    categoryScores.output.maxScore += weight;

    if (check.type === 'includesAll') {
      const missing = check.values.filter((value) => !output.toLowerCase().includes(value.toLowerCase()));
      if (missing.length === 0) {
        score += weight;
        categoryScores.output.score += weight;
        details.push(`PASS includesAll: ${check.values.join(', ')}`);
      } else {
        details.push(`FAIL missing: ${missing.join(', ')}`);
      }
    }

    if (check.type === 'excludesAll') {
      const found = check.values.filter((value) => output.toLowerCase().includes(value.toLowerCase()));
      if (found.length === 0) {
        score += weight;
        categoryScores.output.score += weight;
        details.push(`PASS excludesAll: ${check.values.join(', ')}`);
      } else {
        details.push(`FAIL found forbidden: ${found.join(', ')}`);
      }
    }

    if (check.type === 'maxLength') {
      if (output.length <= check.value) {
        score += weight;
        categoryScores.output.score += weight;
        details.push(`PASS maxLength <= ${check.value}`);
      } else {
        details.push(`FAIL too long: ${output.length}/${check.value}`);
      }
    }
  }

  return { score, maxScore, details, categoryScores };
}

function scoreVariantDesign(spec: HarnessSpec, variant: VariantSpec) {
  const details: string[] = [];
  const categoryScores: Record<string, { score: number; maxScore: number }> = {
    process: { score: 0, maxScore: 4 },
    engineering: { score: 0, maxScore: 4 },
    operations: { score: 0, maxScore: 4 },
  };

  const orchestrationText = JSON.stringify(variant.orchestration ?? spec.workflow?.orchestration ?? {}).toLowerCase();
  const promptText = [variant.system, variant.developer ?? '', variant.userTemplate].join(' ').toLowerCase();
  const agentCount = variant.agents?.length ?? 0;

  if (agentCount > 0) {
    categoryScores.process.score += 1;
    details.push(`PASS roles defined: ${agentCount}`);
  } else {
    details.push('FAIL roles missing');
  }

  if (promptText.includes('plan') || promptText.includes('acceptance')) {
    categoryScores.process.score += 1;
    details.push('PASS planning expectation encoded');
  } else {
    details.push('FAIL planning expectation missing');
  }

  if (orchestrationText.includes('review') || orchestrationText.includes('verify')) {
    categoryScores.process.score += 1;
    details.push('PASS review loop present');
  } else {
    details.push('FAIL review loop missing');
  }

  if (spec.workflow?.pattern) {
    categoryScores.process.score += 1;
    details.push(`PASS workflow pattern: ${spec.workflow.pattern}`);
  } else {
    details.push('FAIL workflow pattern unspecified');
  }

  if (spec.qualityGates?.some((gate) => gate.type === 'tests-required') || promptText.includes('test')) {
    categoryScores.engineering.score += 1;
    details.push('PASS test gate present');
  } else {
    details.push('FAIL test gate missing');
  }

  if (spec.artifacts?.some((artifact) => artifact.type === 'plan') || promptText.includes('plan')) {
    categoryScores.engineering.score += 1;
    details.push('PASS plan artifact present');
  } else {
    details.push('FAIL plan artifact missing');
  }

  if (spec.skills?.length || variant.skills?.length) {
    categoryScores.engineering.score += 1;
    details.push('PASS reusable skills referenced');
  } else {
    details.push('FAIL reusable skills missing');
  }

  if (spec.qualityGates?.some((gate) => gate.type === 'structured-output') || promptText.includes('structured')) {
    categoryScores.engineering.score += 1;
    details.push('PASS structured output guidance present');
  } else {
    details.push('FAIL structured output guidance missing');
  }

  if (spec.qualityGates?.some((gate) => gate.type === 'escalation-defined') || orchestrationText.includes('escalat')) {
    categoryScores.operations.score += 1;
    details.push('PASS escalation policy present');
  } else {
    details.push('FAIL escalation policy missing');
  }

  if (orchestrationText.includes('retry') || orchestrationText.includes('re-run') || orchestrationText.includes('rerun')) {
    categoryScores.operations.score += 1;
    details.push('PASS retry or rerun path present');
  } else {
    details.push('FAIL retry or rerun path missing');
  }

  if (spec.artifacts?.some((artifact) => artifact.type === 'eval-report')) {
    categoryScores.operations.score += 1;
    details.push('PASS evaluation report artifact present');
  } else {
    details.push('FAIL evaluation report artifact missing');
  }

  if (spec.qualityGates?.some((gate) => gate.type === 'reviewer-loop')) {
    categoryScores.operations.score += 1;
    details.push('PASS reviewer loop quality gate present');
  } else {
    details.push('FAIL reviewer loop quality gate missing');
  }

  const score = Object.values(categoryScores).reduce((sum, value) => sum + value.score, 0);
  const maxScore = Object.values(categoryScores).reduce((sum, value) => sum + value.maxScore, 0);

  return { score, maxScore, details, categoryScores };
}

function mergeCategoryScores(
  base: Record<string, { score: number; maxScore: number }>,
  extra: Record<string, { score: number; maxScore: number }>,
) {
  const merged = { ...base };

  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key] ?? { score: 0, maxScore: 0 };
    merged[key] = {
      score: current.score + value.score,
      maxScore: current.maxScore + value.maxScore,
    };
  }

  return merged;
}

function renderPrompt(spec: HarnessSpec, variant: VariantSpec, variables: Record<string, string>) {
  const sections = [
    `SYSTEM:\n${variant.system}`,
    variant.developer ? `DEVELOPER:\n${variant.developer}` : '',
    spec.workflow ? `WORKFLOW:\nPattern=${spec.workflow.pattern}` : '',
    variant.agents?.length
      ? `AGENTS:\n${variant.agents
          .map((agent) => `${agent.id}: ${agent.role} -> ${agent.responsibilities.join('; ')}`)
          .join('\n')}`
      : '',
    `USER:\n${renderTemplate(variant.userTemplate, variables)}`,
  ];

  return sections.filter(Boolean).join('\n\n');
}

function runHarness(spec: HarnessSpec): RunReport {
  validateSpec(spec);
  const cases: CaseRunResult[] = [];
  const totals = new Map<string, { variantLabel: string; score: number; maxScore: number }>();

  for (const testCase of spec.cases) {
    const results: VariantCaseResult[] = [];

    for (const variant of spec.variants) {
      const output = testCase.mockOutput[variant.id] ?? '';
      const renderedPrompt = renderPrompt(spec, variant, testCase.variables);
      const outputEvaluation = evaluateOutput(output, testCase.checks);
      const designEvaluation = scoreVariantDesign(spec, variant);
      const mergedCategoryScores = mergeCategoryScores(outputEvaluation.categoryScores, designEvaluation.categoryScores);
      const score = outputEvaluation.score + designEvaluation.score;
      const maxScore = outputEvaluation.maxScore + designEvaluation.maxScore;
      const variantLabel = variant.label ?? variant.id;

      results.push({
        variantId: variant.id,
        variantLabel,
        score,
        maxScore,
        details: [...outputEvaluation.details, ...designEvaluation.details],
        renderedPrompt,
        output,
        categoryScores: mergedCategoryScores,
      });

      const total = totals.get(variant.id) ?? { variantLabel, score: 0, maxScore: 0 };
      total.score += score;
      total.maxScore += maxScore;
      totals.set(variant.id, total);
    }

    results.sort((left, right) => right.score - left.score);
    cases.push({
      caseId: testCase.id,
      winner: results[0],
      results,
    });
  }

  const ranking = [...totals.entries()]
    .map(([variantId, total]) => ({
      variantId,
      variantLabel: total.variantLabel,
      score: total.score,
      maxScore: total.maxScore,
    }))
    .sort((left, right) => right.score - left.score);

  const recommendations = buildRecommendations(spec, cases);

  return {
    evaluationMode: 'mock',
    agentExecuted: false,
    specName: spec.name,
    workflowPattern: spec.workflow?.pattern ?? 'unspecified',
    summary: {
      totalCases: spec.cases.length,
      totalVariants: spec.variants.length,
      overallWinner: ranking[0]?.variantId ?? 'n/a',
    },
    cases,
    ranking,
    recommendations,
  };
}

function buildRecommendations(spec: HarnessSpec, cases: CaseRunResult[]) {
  const recommendations: string[] = [];
  if (!spec.workflow?.pattern) recommendations.push('Add workflow.pattern to make the harness architecture explicit.');
  if (!(spec.qualityGates ?? []).some((gate) => gate.type === 'reviewer-loop')) {
    recommendations.push('Encode a reviewer loop quality gate so generation and verification are distinct steps.');
  }
  if (!(spec.qualityGates ?? []).some((gate) => gate.type === 'escalation-defined')) {
    recommendations.push('Define escalation criteria for ambiguous failures or blocked execution.');
  }
  if (!(spec.artifacts ?? []).some((artifact) => artifact.type === 'eval-report')) {
    recommendations.push('Track an eval-report artifact so results are versionable and reusable.');
  }
  if (!(spec.maturityEvidence?.qualityGatesAutomated ?? false)) {
    recommendations.push('Automate at least one quality gate to move from structured to automated maturity.');
  }

  const weakWinners = cases.filter((result) => result.winner.score / result.winner.maxScore < 0.7);
  if (weakWinners.length > 0) {
    recommendations.push(`Improve weak cases: ${weakWinners.map((result) => result.caseId).join(', ')}.`);
  }

  return recommendations.slice(0, 5);
}

function assessMaturity(spec: HarnessSpec, runReport?: RunReport): MaturityAssessmentResult {
  validateSpec(spec);
  const evidence = withMaturityDefaults(spec.maturityEvidence);
  const axes: AxisScore[] = [
    buildDocumentationAxis(spec, evidence),
    buildStructureAxis(spec, evidence),
    buildEvaluationAxis(spec, evidence, runReport),
    buildGuardrailsAxis(spec, evidence),
    buildAutonomyAxis(spec, evidence),
  ];

  const totalScore = axes.reduce((sum, axis) => sum + axis.score, 0);
  const maxScore = axes.reduce((sum, axis) => sum + axis.maxScore, 0);
  const averageLevel = totalScore / maxScore;
  const level = mapRatioToLevel(averageLevel);

  return {
    specName: spec.name,
    totalScore,
    maxScore,
    level,
    levelLabel: maturityLevelLabels[level],
    axes,
    strengths: axes.filter((axis) => axis.level >= 4).map((axis) => `${axis.label}: ${axis.evidence[0] ?? 'strong evidence present'}`),
    priorities: axes.filter((axis) => axis.level < 4).map((axis) => `${axis.label}: ${axis.nextStep}`),
  };
}

function withMaturityDefaults(input?: Partial<MaturityEvidenceSpec>): MaturityEvidenceSpec {
  return {
    plansVersioned: input?.plansVersioned ?? false,
    docsVersioned: input?.docsVersioned ?? false,
    reusableHarnessPatterns: input?.reusableHarnessPatterns ?? false,
    rolesDefined: input?.rolesDefined ?? false,
    evalCasesRepeatable: input?.evalCasesRepeatable ?? false,
    scoringRubricDefined: input?.scoringRubricDefined ?? false,
    reportsGenerated: input?.reportsGenerated ?? false,
    qualityGatesAutomated: input?.qualityGatesAutomated ?? false,
    structuralGuardrails: input?.structuralGuardrails ?? false,
    reviewLoopEncoded: input?.reviewLoopEncoded ?? false,
    escalationPolicyDefined: input?.escalationPolicyDefined ?? false,
    recoveryWorkflowDefined: input?.recoveryWorkflowDefined ?? false,
  };
}

function buildAxis(
  axis: AxisKey,
  label: string,
  checks: Array<{ pass: boolean; evidence: string; gap: string }>,
  nextStep: string,
): AxisScore {
  const score = checks.filter((check) => check.pass).length;
  const maxScore = checks.length;
  const ratio = score / maxScore;

  return {
    axis,
    label,
    score,
    maxScore,
    level: mapRatioToLevel(ratio),
    evidence: checks.filter((check) => check.pass).map((check) => check.evidence),
    gaps: checks.filter((check) => !check.pass).map((check) => check.gap),
    nextStep,
  };
}

function buildDocumentationAxis(spec: HarnessSpec, evidence: MaturityEvidenceSpec) {
  return buildAxis(
    'documentation',
    'Documentation & Plans',
    [
      {
        pass: evidence.plansVersioned || (spec.artifacts ?? []).some((artifact) => artifact.type === 'plan'),
        evidence: 'Versioned plan artifact exists.',
        gap: 'No explicit plan artifact or versioned execution plan evidence.',
      },
      {
        pass: evidence.docsVersioned || Boolean(spec.description),
        evidence: 'Harness documentation is present in the spec.',
        gap: 'Spec lacks durable documentation of goals and operating model.',
      },
      {
        pass: (spec.artifacts ?? []).some((artifact) => artifact.type === 'design-note'),
        evidence: 'Design note artifact is tracked.',
        gap: 'Design decisions are not modeled as a tracked artifact.',
      },
      {
        pass: (spec.artifacts ?? []).some((artifact) => artifact.type === 'eval-report'),
        evidence: 'Evaluation report is defined as a durable artifact.',
        gap: 'Eval results are not modeled as reusable documentation.',
      },
    ],
    'Add versioned plan, design-note, and eval-report artifacts so agents can work from repo-native context.',
  );
}

function buildStructureAxis(spec: HarnessSpec, evidence: MaturityEvidenceSpec) {
  return buildAxis(
    'structure',
    'Harness Structure',
    [
      {
        pass: Boolean(spec.workflow?.pattern),
        evidence: `Workflow pattern is explicit: ${spec.workflow?.pattern}.`,
        gap: 'Workflow pattern is not declared.',
      },
      {
        pass: evidence.reusableHarnessPatterns || Boolean(spec.workflow?.pattern),
        evidence: 'Harness uses a reusable architecture pattern.',
        gap: 'Harness pattern reuse is not explicit.',
      },
      {
        pass: evidence.rolesDefined || spec.variants.some((variant) => (variant.agents?.length ?? 0) > 0),
        evidence: 'Agent roles and responsibilities are defined.',
        gap: 'Agent roles are not defined.',
      },
      {
        pass: spec.variants.some((variant) => Boolean(variant.orchestration)) || Boolean(spec.workflow?.orchestration),
        evidence: 'Orchestration rules are encoded.',
        gap: 'No orchestration or handoff rules are defined.',
      },
    ],
    'Define workflow pattern, roles, and orchestration rules in the spec rather than leaving them implicit in prompts.',
  );
}

function buildEvaluationAxis(spec: HarnessSpec, evidence: MaturityEvidenceSpec, runReport?: RunReport) {
  return buildAxis(
    'evaluation',
    'Evaluation & Quality',
    [
      {
        pass: evidence.evalCasesRepeatable || spec.cases.length > 0,
        evidence: 'Repeatable eval cases are present.',
        gap: 'No repeatable eval cases are defined.',
      },
      {
        pass: evidence.scoringRubricDefined || spec.cases.some((testCase) => testCase.checks.length > 0),
        evidence: 'Scoring rubric exists via weighted checks.',
        gap: 'No scoring rubric is defined.',
      },
      {
        pass: evidence.reportsGenerated || Boolean(runReport) || (spec.artifacts ?? []).some((artifact) => artifact.type === 'eval-report'),
        evidence: 'Eval reports are generated or modeled.',
        gap: 'Eval reports are not generated or stored.',
      },
      {
        pass: spec.variants.length > 1,
        evidence: 'Harness supports comparative evaluation across variants.',
        gap: 'Comparative variant evaluation is missing.',
      },
    ],
    'Keep repeatable eval cases, a scoring rubric, and a durable report so harness quality improves over time.',
  );
}

function buildGuardrailsAxis(spec: HarnessSpec, evidence: MaturityEvidenceSpec) {
  return buildAxis(
    'guardrails',
    'Guardrails & Enforcement',
    [
      {
        pass: evidence.qualityGatesAutomated || (spec.qualityGates ?? []).length > 0,
        evidence: 'Quality gates are encoded.',
        gap: 'No explicit quality gates are defined.',
      },
      {
        pass: evidence.structuralGuardrails || (spec.qualityGates ?? []).some((gate) => gate.type === 'structured-output'),
        evidence: 'Structured output or structural constraints are present.',
        gap: 'No structural guardrails are defined.',
      },
      {
        pass: (spec.qualityGates ?? []).some((gate) => gate.type === 'tests-required'),
        evidence: 'Test expectations are enforced as a quality gate.',
        gap: 'Tests are not enforced by the harness.',
      },
      {
        pass: (spec.qualityGates ?? []).some((gate) => gate.type === 'documented-plan'),
        evidence: 'Plan documentation is enforced as a gate.',
        gap: 'The harness does not enforce plan documentation.',
      },
    ],
    'Turn policy into explicit quality gates so agents can self-correct without human interpretation.',
  );
}

function buildAutonomyAxis(spec: HarnessSpec, evidence: MaturityEvidenceSpec) {
  return buildAxis(
    'autonomy',
    'Autonomy & Operations',
    [
      {
        pass: evidence.reviewLoopEncoded || (spec.qualityGates ?? []).some((gate) => gate.type === 'reviewer-loop'),
        evidence: 'Reviewer loop is encoded.',
        gap: 'No reviewer loop is encoded.',
      },
      {
        pass: evidence.escalationPolicyDefined || (spec.qualityGates ?? []).some((gate) => gate.type === 'escalation-defined'),
        evidence: 'Escalation policy is defined.',
        gap: 'Escalation policy is not defined.',
      },
      {
        pass: evidence.recoveryWorkflowDefined || JSON.stringify(spec.workflow?.orchestration ?? {}).toLowerCase().includes('retry'),
        evidence: 'Recovery or retry workflow is defined.',
        gap: 'No retry or recovery path is modeled.',
      },
      {
        pass: spec.variants.some((variant) => {
          const orchestrationText = JSON.stringify(variant.orchestration ?? {}).toLowerCase();
          return orchestrationText.includes('verify') || orchestrationText.includes('verification');
        }),
        evidence: 'Execution includes a verification step.',
        gap: 'No verification step is modeled in orchestration.',
      },
    ],
    'Add review, verification, escalation, and recovery loops so the harness can support higher autonomy safely.',
  );
}

function mapRatioToLevel(ratio: number) {
  if (ratio >= 0.95) return 5;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function formatRunReportText(report: RunReport) {
  const lines = [
    `Harness Run: ${report.specName}`,
    'Mode: MOCK — supplied outputs and heuristic scores; no agent execution.',
    `Workflow: ${report.workflowPattern}`,
    `Cases: ${report.summary.totalCases}`,
    `Variants: ${report.summary.totalVariants}`,
    `Overall winner: ${report.summary.overallWinner}`,
    '',
    'Ranking:',
    ...report.ranking.map(
      (entry, index) => `${index + 1}. ${entry.variantId} (${entry.variantLabel}) ${entry.score}/${entry.maxScore}`,
    ),
    '',
  ];

  for (const caseResult of report.cases) {
    lines.push(`Case: ${caseResult.caseId}`);
    lines.push(`Winner: ${caseResult.winner.variantId} ${caseResult.winner.score}/${caseResult.winner.maxScore}`);
    for (const result of caseResult.results) {
      lines.push(`- ${result.variantId}: ${result.score}/${result.maxScore}`);
      for (const [category, categoryScore] of Object.entries(result.categoryScores)) {
        lines.push(`  ${category}: ${categoryScore.score}/${categoryScore.maxScore}`);
      }
    }
    lines.push('');
  }

  lines.push('Recommendations:');
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation}`);
  }

  return lines.join('\n');
}

function formatRunReportMarkdown(report: RunReport) {
  const rankingRows = report.ranking
    .map((entry) => `| ${entry.variantId} | ${entry.variantLabel} | ${entry.score} | ${entry.maxScore} |`)
    .join('\n');
  const caseSections = report.cases
    .map((caseResult) => {
      const rows = caseResult.results.map((result) => `| ${result.variantId} | ${result.score} | ${result.maxScore} |`).join('\n');
      return `### ${caseResult.caseId}\n\nWinner: \`${caseResult.winner.variantId}\`\n\n| Variant | Score | Max |\n|---|---:|---:|\n${rows}`;
    })
    .join('\n\n');

  return [
    '# Harness Run Report',
    'Mode: MOCK — supplied outputs and heuristic scores; no agent execution.',
    '',
    `- Spec: ${report.specName}`,
    `- Workflow: ${report.workflowPattern}`,
    `- Cases: ${report.summary.totalCases}`,
    `- Variants: ${report.summary.totalVariants}`,
    `- Overall winner: ${report.summary.overallWinner}`,
    '',
    '## Ranking',
    '',
    '| Variant | Label | Score | Max |',
    '|---|---|---:|---:|',
    rankingRows,
    '',
    '## Cases',
    '',
    caseSections,
    '',
    '## Recommendations',
    '',
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
  ].join('\n');
}

function formatMaturityText(result: MaturityAssessmentResult) {
  const lines = [
    `Harness Maturity: ${result.specName}`,
    `Score: ${result.totalScore}/${result.maxScore}`,
    `Level: ${result.levelLabel}`,
    '',
  ];

  for (const axis of result.axes) {
    lines.push(`${axis.label}: ${axis.score}/${axis.maxScore} (${maturityLevelLabels[axis.level]})`);
    if (axis.evidence.length > 0) lines.push(`  evidence: ${axis.evidence.join(' | ')}`);
    if (axis.gaps.length > 0) lines.push(`  gaps: ${axis.gaps.join(' | ')}`);
    lines.push(`  next: ${axis.nextStep}`);
    lines.push('');
  }

  if (result.strengths.length > 0) {
    lines.push('Strengths:');
    for (const strength of result.strengths) lines.push(`- ${strength}`);
    lines.push('');
  }

  lines.push('Priorities:');
  for (const priority of result.priorities) lines.push(`- ${priority}`);
  return lines.join('\n');
}

function formatMaturityMarkdown(result: MaturityAssessmentResult) {
  return [
    '# Harness Maturity Report',
    'Heuristic assessment including self-declared evidence; not runtime certification.',
    '',
    `- Spec: ${result.specName}`,
    `- Score: ${result.totalScore}/${result.maxScore}`,
    `- Level: ${result.levelLabel}`,
    '',
    '## Axes',
    '',
    '| Axis | Score | Level |',
    '|---|---:|---|',
    ...result.axes.map((axis) => `| ${axis.label} | ${axis.score}/${axis.maxScore} | ${maturityLevelLabels[axis.level]} |`),
    '',
    '## Priorities',
    '',
    ...result.priorities.map((priority) => `- ${priority}`),
  ].join('\n');
}

function serialize(format: OutputFormat, payload: RunReport | MaturityAssessmentResult | AuditResult | PlanResult | DetectResult) {
  if (format === 'json') return JSON.stringify(payload, null, 2);

  if ('summary' in payload && 'cases' in payload) {
    return format === 'md' ? formatRunReportMarkdown(payload) : formatRunReportText(payload);
  }

  if ('axes' in payload) {
    return format === 'md' ? formatMaturityMarkdown(payload) : formatMaturityText(payload);
  }

  if ('findings' in payload) {
    return format === 'md' ? formatAuditMarkdown(payload) : formatAuditText(payload);
  }

  if ('signals' in payload) {
    return format === 'md' ? formatDetectMarkdown(payload) : formatDetectText(payload);
  }

  return format === 'md' ? formatPlanMarkdown(payload) : formatPlanText(payload);
}

function writeOutput(output: string, filePath?: string) {
  if (!filePath) {
    console.log(output);
    return;
  }

  const absolute = resolve(filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, output, 'utf-8');
  console.log(`Wrote ${absolute}`);
}

function starterSpec(): HarnessSpec {
  return {
    name: 'Software Engineering Harness Starter',
    description:
      'Starter harness for software engineering tasks with explicit roles, evaluation artifacts, and maturity evidence.',
    workflow: {
      pattern: 'generate-verify',
      objective: 'Implement changes safely with review, test, and escalation steps.',
      orchestration: {
        reviewLoop: 'Builder hands off to reviewer, reviewer requests fixes until quality gates pass.',
        escalation: 'Escalate when requirements conflict, test failures are ambiguous, or structural constraints block progress.',
        retryPolicy: 'Retry once after automated fixes, then escalate.',
        verification: 'Run tests and compare output against acceptance criteria before completion.',
      },
    },
    variants: [
      {
        id: 'baseline-engineering',
        label: 'Baseline Engineering',
        system: 'You are a pragmatic software engineer.',
        developer:
          'Create a plan, implement the task, run verification, and summarize risks. Use structured sections for plan, execution, verification, and follow-ups.',
        userTemplate:
          'Task: {{task}}\nAcceptance criteria: {{acceptance}}\nRelevant files: {{files}}\nReturn a concise implementation report.',
        agents: [
          {
            id: 'builder',
            role: 'Implementation engineer',
            responsibilities: ['Create execution plan', 'Implement change', 'Run local verification'],
            expectedOutputs: ['change summary', 'verification notes'],
          },
          {
            id: 'reviewer',
            role: 'Quality reviewer',
            responsibilities: ['Validate acceptance criteria', 'Identify risks', 'Request fixes if needed'],
            expectedOutputs: ['review findings', 'approval or rework request'],
          },
        ],
        skills: ['plan-writing', 'code-review'],
        orchestration: {
          handoff: 'builder -> reviewer',
          reviewLoop: 'Repeat until no blocking findings remain.',
          verification: 'Run tests and re-check acceptance criteria.',
          escalation: 'Escalate missing requirements or ambiguous failures.',
          retryPolicy: 'One corrective pass before escalation.',
        },
      },
    ],
    cases: [
      {
        id: 'code-review-case',
        variables: {
          task: 'Review an API handler that writes request payloads directly to the database.',
          acceptance: 'Call out validation, tests, and production risk.',
          files: 'src/api/user.ts',
        },
        mockOutput: {
          'baseline-engineering':
            'Plan: inspect the handler and validation path. Execution: identify missing validation and direct insert risk. Verification: require tests for invalid payloads. Risks: invalid data can reach production.',
        },
        checks: [
          { type: 'includesAll', values: ['validation', 'tests', 'risk'], weight: 2 },
          { type: 'maxLength', value: 320, weight: 1 },
        ],
      },
    ],
    skills: [
      {
        id: 'plan-writing',
        description: 'Write versionable execution plans with acceptance criteria and validation steps.',
        appliesTo: ['builder'],
      },
      {
        id: 'code-review',
        description: 'Check for validation, tests, observability, and operational risks.',
        appliesTo: ['reviewer'],
      },
    ],
    artifacts: [
      { id: 'execution-plan', type: 'plan', required: true, description: 'Versioned execution plan for the task.' },
      { id: 'design-note', type: 'design-note', required: false, description: 'Decision record for non-trivial changes.' },
      { id: 'eval-report', type: 'eval-report', required: true, description: 'Harness run report for comparison over time.' },
    ],
    qualityGates: [
      { type: 'documented-plan', weight: 1, description: 'Work must start from a documented plan.' },
      { type: 'tests-required', weight: 1, description: 'Tests or test evidence must be included.' },
      { type: 'structured-output', weight: 1, description: 'Outputs must follow a structured report format.' },
      { type: 'reviewer-loop', weight: 1, description: 'Reviewer must sign off before completion.' },
      { type: 'escalation-defined', weight: 1, description: 'Blocked or ambiguous work must escalate.' },
    ],
    maturityEvidence: {
      plansVersioned: true,
      docsVersioned: true,
      reusableHarnessPatterns: true,
      rolesDefined: true,
      evalCasesRepeatable: true,
      scoringRubricDefined: true,
      reportsGenerated: true,
      qualityGatesAutomated: false,
      structuralGuardrails: true,
      reviewLoopEncoded: true,
      escalationPolicyDefined: true,
      recoveryWorkflowDefined: true,
    },
  };
}

function tryReadPackageJson(repoRoot: string) {
  const packageJsonPath = join(repoRoot, 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  try {
    return {
      path: packageJsonPath,
      data: readJsonFile<Record<string, unknown>>(packageJsonPath),
    };
  } catch {
    return null;
  }
}

function addSignal(signals: DetectionSignal[], signal: DetectionSignal) {
  if (signals.some((current) => current.kind === signal.kind && current.path === signal.path && current.detail === signal.detail)) {
    return;
  }
  signals.push(signal);
}

function addProfile(profileIds: Set<string>, profileId: string) {
  if (profilePacks[profileId]) profileIds.add(profileId);
}

function detectProjectProfiles(repoRoot: string): DetectResult {
  const absoluteRoot = resolve(repoRoot);
  const signals: DetectionSignal[] = [];
  const profiles = new Set<string>();

  const packageJson = tryReadPackageJson(absoluteRoot);
  const pkg = packageJson?.data;
  const dependencyNames = new Set<string>();

  if (pkg && typeof pkg === 'object') {
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = pkg[key];
      if (deps && typeof deps === 'object') {
        for (const name of Object.keys(deps as Record<string, unknown>)) dependencyNames.add(name);
      }
    }
  }

  if (packageJson) {
    addSignal(signals, { kind: 'tooling', path: relative(absoluteRoot, packageJson.path) || 'package.json', detail: 'package.json', confidence: 0.95 });
    const engines = pkg?.engines as Record<string, unknown> | undefined;
    const scripts = pkg?.scripts as Record<string, unknown> | undefined;
    if (engines && typeof engines.node === 'string') {
      addSignal(signals, { kind: 'runtime', path: 'package.json', detail: `Node.js ${engines.node}`, confidence: 0.95 });
    }
    if (pkg?.type === 'module') {
      addSignal(signals, { kind: 'language', path: 'package.json', detail: 'JavaScript ESM', confidence: 0.95 });
    }
    if (scripts && Object.values(scripts).some(value => typeof value === 'string' && /\bnode\b[^;&|]*\s--test(?:\s|$|=)/.test(value))) {
      addSignal(signals, { kind: 'test', path: 'package.json', detail: 'Node.js test runner', confidence: 0.95 });
    }

    if (dependencyNames.has('next')) {
      addSignal(signals, { kind: 'framework', path: relative(absoluteRoot, packageJson.path) || 'package.json', detail: 'Next.js dependency', confidence: 0.98 });
      addProfile(profiles, 'nextjs-frontend');
    }
    if (dependencyNames.has('react')) {
      addSignal(signals, { kind: 'framework', path: relative(absoluteRoot, packageJson.path) || 'package.json', detail: 'React dependency', confidence: 0.9 });
      if (!profiles.has('nextjs-frontend')) addProfile(profiles, 'react-frontend');
    }
    if (dependencyNames.has('vitest') || dependencyNames.has('jest')) {
      addSignal(signals, { kind: 'test', path: relative(absoluteRoot, packageJson.path) || 'package.json', detail: dependencyNames.has('vitest') ? 'Vitest' : 'Jest', confidence: 0.85 });
    }
    if (dependencyNames.has('typescript')) {
      addSignal(signals, { kind: 'language', path: relative(absoluteRoot, packageJson.path) || 'package.json', detail: 'TypeScript', confidence: 0.85 });
    }
  }

  // Signals describe observed tooling even when no curated policy pack exists.
  for (const pythonFile of ['pyproject.toml', 'requirements.txt']) {
    const pythonPath = join(absoluteRoot, pythonFile);
    if (!existsSync(pythonPath)) continue;
    const source = readTextIfExists(pythonPath).split('\n').map(line => line.replace(/#.*$/, '')).join('\n');
    addSignal(signals, { kind: 'language', path: pythonFile, detail: 'Python', confidence: 0.9 });
    addSignal(signals, { kind: 'tooling', path: pythonFile, detail: pythonFile, confidence: 0.95 });
    for (const [dependency, kind, detail] of [
      ['fastapi', 'framework', 'FastAPI'], ['pytest', 'test', 'pytest'],
    ] as const) {
      const pattern = new RegExp(`(?:^|[\\s"'])${dependency}(?=[\\s"'\\[<>=!~;]|$)`, 'im');
      if (pattern.test(source)) addSignal(signals, { kind, path: pythonFile, detail, confidence: 0.85 });
    }
  }

  for (const nextConfigName of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    const nextConfigPath = join(absoluteRoot, nextConfigName);
    if (existsSync(nextConfigPath)) {
      addSignal(signals, { kind: 'framework', path: nextConfigName, detail: 'Next.js config', confidence: 0.99 });
      addProfile(profiles, 'nextjs-frontend');
    }
  }

  const tsconfigPath = join(absoluteRoot, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    addSignal(signals, { kind: 'language', path: 'tsconfig.json', detail: 'TypeScript config', confidence: 0.8 });
  }

  for (const gradleName of ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle', 'gradle.properties']) {
    const gradlePath = join(absoluteRoot, gradleName);
    if (existsSync(gradlePath)) {
      addSignal(signals, { kind: gradleName.startsWith('build') ? 'tooling' : 'runtime', path: gradleName, detail: 'Gradle build signal', confidence: 0.9 });
    }
  }

  const buildGradleKts = readTextIfExists(join(absoluteRoot, 'build.gradle.kts'));
  const buildGradle = readTextIfExists(join(absoluteRoot, 'build.gradle'));
  const gradleText = `${buildGradleKts}\n${buildGradle}`.toLowerCase();
  if (gradleText.includes('kotlin(') || gradleText.includes('org.jetbrains.kotlin')) {
    addSignal(signals, { kind: 'language', path: buildGradleKts ? 'build.gradle.kts' : 'build.gradle', detail: 'Kotlin build plugin', confidence: 0.95 });
  }
  if (gradleText.includes('spring-boot') || gradleText.includes('org.springframework.boot')) {
    addSignal(signals, { kind: 'framework', path: buildGradleKts ? 'build.gradle.kts' : 'build.gradle', detail: 'Spring Boot plugin/dependency', confidence: 0.98 });
    addProfile(profiles, 'kotlin-spring-backend');
  }
  if (gradleText.includes('ktor')) {
    addSignal(signals, { kind: 'framework', path: buildGradleKts ? 'build.gradle.kts' : 'build.gradle', detail: 'Ktor dependency', confidence: 0.96 });
    addProfile(profiles, 'kotlin-ktor-backend');
  }
  if (gradleText.includes('test')) {
    addSignal(signals, { kind: 'test', path: buildGradleKts ? 'build.gradle.kts' : 'build.gradle', detail: 'Gradle test task', confidence: 0.75 });
  }

  const pomXmlPath = join(absoluteRoot, 'pom.xml');
  if (existsSync(pomXmlPath)) {
    addSignal(signals, { kind: 'tooling', path: 'pom.xml', detail: 'Maven build signal', confidence: 0.9 });
    const pomText = readTextIfExists(pomXmlPath).toLowerCase();
    if (pomText.includes('spring-boot')) {
      addSignal(signals, { kind: 'framework', path: 'pom.xml', detail: 'Spring Boot dependency', confidence: 0.97 });
      addProfile(profiles, 'kotlin-spring-backend');
    }
    if (pomText.includes('kotlin')) {
      addSignal(signals, { kind: 'language', path: 'pom.xml', detail: 'Kotlin Maven config', confidence: 0.85 });
    }
  }

  const workflowDir = join(absoluteRoot, '.github', 'workflows');
  if (existsSync(workflowDir) && statSync(workflowDir).isDirectory()) {
    for (const workflowFile of readdirSync(workflowDir).sort()) {
      addSignal(signals, { kind: 'ci', path: join('.github', 'workflows', workflowFile), detail: 'GitHub Actions workflow', confidence: 0.8 });
    }
  }

  const detectedProfiles = [...profiles].sort();
  const suggestedPacks = detectedProfiles.filter((profileId) => Boolean(profilePacks[profileId]));
  const packs = suggestedPacks.map((packId) => profilePacks[packId]);
  const stackSummary =
    detectedProfiles.length > 0
      ? detectedProfiles.map((profileId) => profilePacks[profileId]?.label ?? profileId).join(', ')
      : [...new Set(signals.filter(signal => ['runtime', 'language', 'framework'].includes(signal.kind)).map(signal => signal.detail))].join(', ') || 'No known stack profile detected';

  return {
    repoRoot: absoluteRoot,
    stackSummary,
    detectedProfiles,
    suggestedPacks,
    signals: signals.sort((left, right) => left.path.localeCompare(right.path) || left.detail.localeCompare(right.detail)),
    packs,
  };
}

function formatPackSuggestions(
  packs: ProjectProfilePack[],
  selector: 'goldenRuleSuggestions' | 'constraintSuggestions' | 'featureSpecHints' | 'contractHints',
) {
  if (packs.length === 0) return '';

  const lines = [''];
  for (const pack of packs) {
    lines.push(`## Suggested ${pack.label}`);
    for (const item of pack[selector]) lines.push(`- ${item}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatDetectText(result: DetectResult) {
  const lines = [
    `Harness Detect: ${result.repoRoot}`,
    `Stack summary: ${result.stackSummary}`,
    `Detected profiles: ${result.detectedProfiles.length > 0 ? result.detectedProfiles.join(', ') : 'none'}`,
    `Suggested packs: ${result.suggestedPacks.length > 0 ? result.suggestedPacks.join(', ') : 'none'}`,
    '',
    'Signals:',
    ...(result.signals.length > 0
      ? result.signals.map((signal) => `- [${signal.kind}] ${signal.detail} (${signal.path})`)
      : ['- none']),
  ];

  if (result.packs.length > 0) {
    lines.push('', 'Pack recommendations:');
    for (const pack of result.packs) {
      lines.push(`- ${pack.id}: ${pack.summary}`);
    }
  }

  return lines.join('\n');
}

function formatDetectMarkdown(result: DetectResult) {
  return [
    '# Harness Detect Report',
    '',
    `- Repo: ${result.repoRoot}`,
    `- Stack summary: ${result.stackSummary}`,
    `- Detected profiles: ${result.detectedProfiles.length > 0 ? result.detectedProfiles.join(', ') : 'none'}`,
    `- Suggested packs: ${result.suggestedPacks.length > 0 ? result.suggestedPacks.join(', ') : 'none'}`,
    '',
    '## Signals',
    '',
    ...(result.signals.length > 0
      ? result.signals.map((signal) => `- [${signal.kind}] ${signal.detail} (${signal.path})`)
      : ['- none']),
    '',
    '## Pack Recommendations',
    '',
    ...(result.packs.length > 0 ? result.packs.map((pack) => `- ${pack.id}: ${pack.summary}`) : ['- none']),
  ].join('\n');
}

function repoKitManifestTemplate(detection?: DetectResult): RepoHarnessManifest {
  return {
    version: '1',
    repoName: detection ? basename(detection.repoRoot) : 'Sample Product Repo',
    description: 'Harness engineering kit for spec-driven, ADR-aware AI-assisted delivery.',
    policyMode: 'warn-block-critical',
    stackSummary: detection?.stackSummary ?? 'No known stack profile detected',
    sourcePriority: [
      'feature spec',
      'related adr',
      'repo constraints',
      'golden rules',
      'general repo context',
    ],
    detectedProfiles: detection?.detectedProfiles ?? [],
    suggestedPacks: detection?.suggestedPacks ?? [],
    approvedPacks: [],
    detectedSignals: detection?.signals ?? [],
    paths: {
      rulesDir: 'harness/rules',
      specsDir: 'harness/specs',
      adrsDir: 'harness/adrs',
      contractsDir: 'harness/contracts',
      templatesDir: 'harness/templates',
      reportsDir: 'reports',
    },
    requiredFiles: [
      'AGENTS.md',
      'CLAUDE.md',
      'harness/workflow.md',
      'harness/project.md',
      'harness/maintenance.json',
      'harness/rules/golden-rules.md',
      'harness/rules/constraints.md',
      'harness/templates/feature-spec.md',
      'harness/templates/adr.md',
      'harness/templates/contract.md',
    ],
    criticalChecks: [
      'manifest-present',
      'golden-rules-present',
      'constraints-present',
      'feature-spec-has-acceptance',
    ],
  };
}

function codeReviewerAgent() {
  const skill = readFileSync(new URL('../skills/harness-review/SKILL.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const frontmatter = /^---\n[\s\S]*?\n---\n+/;
  if (!frontmatter.test(skill)) throw new Error('skills/harness-review/SKILL.md is missing frontmatter');
  const body = skill.replace(frontmatter, '');
  return `---
name: code-reviewer
description: Independent read-only code reviewer. Use after implementing a change and before declaring it complete, or when asked to review a diff, branch, commit or PR. Checks correctness, compatibility, security, tests and compliance with the harness spec, ADRs and rules.
tools: Read, Grep, Glob, Bash
model: opus
---

<!-- Generated by harness-lab from skills/harness-review/SKILL.md. -->

${body}`;
}

const optionalKitPaths = ['.claude/agents/code-reviewer.md'];
// Tool-managed files must stay template-identical so update can refresh them; everything else is project-owned.
const managedKitPaths = ['AGENTS.md', 'CLAUDE.md', 'harness/workflow.md', 'harness/templates/feature-spec.md', 'harness/templates/adr.md', 'harness/templates/contract.md', ...optionalKitPaths];
const sampleKitPaths = [
  'harness/specs/feature-harness-apply.md',
  'harness/adrs/adr-spec-driven-delivery.md',
  'harness/contracts/contract-harness-apply-foundation.md',
  'reports/repo-kit-audit-report.md',
  'reports/repo-kit-plan-report.md',
  'reports/harness-apply-skill-note.md',
];

const projectInstructions = `# Project instructions

Project-owned. Add instructions specific to this repository here, such as operational cautions, domain rules or verification notes that do not fit a spec, ADR or rule file. harness-lab creates this file once and never replaces your edits; keep \`AGENTS.md\`, \`CLAUDE.md\` and \`harness/workflow.md\` identical to the template so \`harness-lab update\` can refresh them.

- No project-specific instructions yet.
`;

function repoKitFiles(detection: DetectResult) {
  const manifest = `${JSON.stringify(repoKitManifestTemplate(detection), null, 2)}\n`;
  const packSummary =
    detection.packs.length > 0
      ? detection.packs.map((pack) => `- ${pack.id}: ${pack.summary}`).join('\n')
      : '- No profile packs detected yet. Add project-specific constraints manually after repo review.';
  const agents = `# Agent Instructions

Follow this repository-local workflow for substantive work. The \`harness-apply\` skill is optional.

Startup sequence:
1. Read \`harness/manifest.json\`.
2. Select the feature spec in \`harness/specs/\` whose Scope covers the request, and read specs it also touches as secondary. Specs move \`draft\` -> \`active\` (under development) -> \`maintained\` (implemented regression baseline); \`active\` and \`maintained\` specs are both selectable. If no spec fits, write one from \`harness/templates/feature-spec.md\` before changing code; if several fit equally, ask the user. State which spec you selected.
3. Read \`approvedPacks\` from the manifest. If it is empty, treat \`suggestedPacks\` as recommendations only.
4. Read linked ADRs and contracts before making code changes.
5. Read \`harness/rules/constraints.md\`, \`harness/rules/golden-rules.md\` and \`harness/project.md\`. \`harness/project.md\` holds project-specific instructions; treat them as repo constraints.
6. Map the user request to acceptance criteria and project-specific verification commands. Run checks before claiming completion; record argv, exit status and evidence. Static audit or mock scores do not prove execution.
7. Record architectural or cross-cutting changes in an ADR, including alternatives and consequences.
8. Review \`harness/maintenance.json\` every 30 days and after repeated failures or stack changes. Remove duplicate guidance, check stale ADRs and unused packs, compare instruction size, and add a regression check for recurring failures. Preserve decision history. Record reviewedAt and a nonempty summary only after review and verification.

Development routing:
- For implementation requests, use the available \`harness-develop\` skill or follow the same core workflow: map requirements to checks, assign independent tasks with exclusive file ownership and explicit dependencies, then integrate and verify as coordinator. State why when using a single-agent fallback.
- Before claiming implementation complete, obtain an independent read-only review: the \`code-reviewer\` agent in Claude, or a separate agent following the \`harness-review\` skill elsewhere. Fix and re-review Critical and High findings, or justify them in the report. State why when review is skipped for a trivial change.
- Use the host's available agent tools. Do not assume Git worktrees or a particular orchestration service exists.

Response contract:
- Include \`References used\`, \`Constraints\`, \`Conflicts or gaps\`, and \`Escalation\`.
- Escalate when required harness artifacts are missing or conflicting.
- State which approved or suggested profile packs were used.
`;
  const goldenRules = `# Golden Rules

1. Work from the selected feature spec before editing code.
2. Honor linked ADRs when they exist. Escalate conflicts instead of silently overriding them.
3. Keep plans, verification evidence, and review notes repo-native.
4. Block completion when critical requirements or verification evidence are missing.
5. Prefer narrow, reversible changes over broad speculative refactors.

## Suggested Profile Pack Overlays

These are generated from repository signals and require human approval before they become source of truth.

${packSummary}
${formatPackSuggestions(detection.packs, 'goldenRuleSuggestions')}
`;
  const constraints = `# Constraints

- Default policy mode: warn on drift, block critical gaps.
- Every feature change needs a feature spec in \`harness/specs/\`.
- Architectural or cross-cutting decisions need an ADR in \`harness/adrs/\`.
- AI responses must cite the spec, ADRs, and rules they used.
- If the repo state contradicts the spec or ADR, escalate instead of guessing.

## Detected Stack Summary

- ${detection.stackSummary}

## Suggested Profile Pack Constraints

These constraints are recommendations derived from the detected repository signals. Move relevant items into approved rules after review.
${formatPackSuggestions(detection.packs, 'constraintSuggestions')}
`;
  const featureSpecTemplate = `---
id: feature-template
title: Replace Me
status: draft
owner: team-name
related_adrs:
  - adr-template
related_contracts:
  - contract-template
required_evidence:
  - tests
  - rollout-notes
---

# Feature Spec: Replace Me

## Problem
Describe the user or system problem.

## Scope
- In scope item
- Out of scope item

## Acceptance Criteria
- Concrete acceptance criterion

## Constraints
- Relevant technical or product constraint

## Stack Notes
${detection.packs.length > 0 ? detection.packs.flatMap((pack) => pack.featureSpecHints).map((item) => `- ${item}`).join('\n') : '- Add stack-specific notes after reviewing the target repo.'}

## Evidence
- What verification evidence must exist before closing
`;
  const adrTemplate = `---
id: adr-template
title: Replace Me
status: proposed
related_specs:
  - feature-template
---

# ADR: Replace Me

## Context
Why this decision is needed.

## Decision
What is being chosen.

## Consequences
- Positive outcome
- Tradeoff or risk
`;
  const contractTemplate = `---
id: contract-template
title: Replace Me
status: draft
related_specs:
  - feature-template
evidence_files:
  - reports/example-report.md
---

# Contract: Replace Me

## Goal
Describe the chunk of work this contract covers.

## Scope
- Included implementation slice
- Explicit non-goal for this chunk

## Done Criteria
- Testable behavior that must work when this contract is complete

## Verification
- Command, test, or review step used to verify completion

## Evidence References
- reports/example-report.md

## Stack-Specific Verification Notes
${detection.packs.length > 0 ? detection.packs.flatMap((pack) => pack.contractHints).map((item) => `- ${item}`).join('\n') : '- Add stack-specific verification notes after reviewing the target repo.'}
`;
  const sampleSpec = `---
id: feature-harness-apply
title: Add repo-native harness apply workflow
status: active
owner: platform-ai
related_adrs:
  - adr-spec-driven-delivery
related_contracts:
  - contract-harness-apply-foundation
required_evidence:
  - unit-tests
  - audit-report
  - skill-doc
---

# Feature Spec: Add repo-native harness apply workflow

## Problem
AI-assisted development is inconsistent because repo rules, ADRs, and task expectations are not encoded in one place.

## Scope
- Add a repo harness manifest, rules, spec template, and ADR template.
- Add a skill that forces agents to read spec and ADR context first.
- Add audit tooling that reports missing critical harness artifacts.

## Acceptance Criteria
- The repo contains a manifest that defines source priority and policy mode.
- A feature spec and linked ADR exist for harness-aware delivery.
- The skill states which spec, ADR, and rule files it used.
- Audit blocks when critical harness files or acceptance criteria are missing.

## Constraints
- Preserve existing legacy harness evaluation commands.
- Prefer Markdown for human-maintained docs and JSON for machine-readable manifest data.
- Use warn-plus-block-critical enforcement by default.

## Evidence
- \`npm run build\`
- \`harness-lab audit . --format md\`
- \`harness-lab plan harness/specs/feature-harness-apply.md --format text\`
`;
  const sampleAdr = `---
id: adr-spec-driven-delivery
title: Make feature specs and ADRs the top AI source of truth
status: accepted
related_specs:
  - feature-harness-apply
---

# ADR: Make feature specs and ADRs the top AI source of truth

## Context
General prompts and repo-wide rules are too weak to keep AI work aligned on non-trivial changes.

## Decision
Use feature specs as the first source of truth for active work and ADRs as the architectural source of truth. Keep repo rules as shared policy, not task-level intent.

## Consequences
- Agents can explain which requirements and decisions they are following.
- Review becomes easier because intent and architecture are versioned.
- Missing or conflicting documents become explicit escalation points.
`;
  const sampleContract = `---
id: contract-harness-apply-foundation
title: Foundation contract for harness apply repo kit
status: active
related_specs:
  - feature-harness-apply
evidence_files:
  - reports/repo-kit-audit-report.md
  - reports/repo-kit-plan-report.md
  - reports/harness-apply-skill-note.md
---

# Contract: Foundation contract for harness apply repo kit

## Goal
Create the minimum repo-native harness workflow needed for spec-driven and ADR-aware AI development.

## Scope
- Add the repo kit structure, templates, and example documents.
- Add the harness apply skill and make it cite the files it uses.
- Add audit and planning commands that enforce critical harness requirements.

## Done Criteria
- The repo kit can be scaffolded into a target repo.
- The example feature spec links to both an ADR and a contract.
- Audit reports missing required harness files, missing linked artifacts, and broken local links.
- Planning output tells the agent to read the linked contract before implementation.

## Verification
- Run \`npm run build\`.
- Run \`harness-lab audit .\`.
- Run \`harness-lab plan harness/specs/feature-harness-apply.md\`.

## Evidence References
- reports/repo-kit-audit-report.md
- reports/repo-kit-plan-report.md
- reports/harness-apply-skill-note.md
`;
  const sampleAuditEvidence = `# Example Audit Evidence

- This file stands in for a repo-local audit output artifact.
- Real repos should regenerate it from \`node dist/index.js audit <repo>\`.
`;
  const samplePlanEvidence = `# Example Plan Evidence

- This file stands in for a repo-local plan output artifact.
- Real repos should regenerate it from \`node dist/index.js plan <feature-spec>\`.
`;
  const sampleSkillEvidence = `# Harness Apply Skill Note

- The active skill must cite the manifest, feature spec, ADR, and contract it used.
- Real repos can replace this note with generated run evidence or a recorded review artifact.
`;

  return {
    'AGENTS.md': '# Codex entry point\n\nRead and follow [the shared workflow](harness/workflow.md) and [project instructions](harness/project.md) before substantive work.\n',
    'CLAUDE.md': '# Claude entry point\n\nFollow the shared workflow and project instructions before substantive work. Claude Code loads them through these imports:\n\n@harness/workflow.md\n@harness/project.md\n',
    'harness/workflow.md': agents,
    'harness/project.md': projectInstructions,
    '.claude/agents/code-reviewer.md': codeReviewerAgent(),
    'harness/maintenance.json': JSON.stringify({ reviewedAt: null, summary: '' }, null, 2) + '\n',
    'harness/manifest.json': manifest,
    'harness/rules/golden-rules.md': goldenRules,
    'harness/rules/constraints.md': constraints,
    'harness/templates/feature-spec.md': featureSpecTemplate,
    'harness/templates/adr.md': adrTemplate,
    'harness/templates/contract.md': contractTemplate,
    'harness/specs/feature-harness-apply.md': sampleSpec,
    'harness/adrs/adr-spec-driven-delivery.md': sampleAdr,
    'harness/contracts/contract-harness-apply-foundation.md': sampleContract,
    'reports/repo-kit-audit-report.md': sampleAuditEvidence,
    'reports/repo-kit-plan-report.md': samplePlanEvidence,
    'reports/harness-apply-skill-note.md': sampleSkillEvidence,
  };
}

function initRepoKit(rootPath: string, apply = true) {
  const absoluteRoot = resolveKitRoot(rootPath);
  const detection = detectProjectProfiles(absoluteRoot);
  const result = installKit(absoluteRoot, repoKitFiles(detection), { version: toolVersion, mode: 'init', apply, optional: optionalKitPaths, initOnly: sampleKitPaths });
  return { absoluteRoot, detection, result };
}

function printKitResult(action: string, root: string, result: KitResult, format: OutputFormat) {
  if (format === 'json') {
    console.log(JSON.stringify({ action, root: resolve(root), ...result }, null, 2));
    return;
  }
  const title = `${action} in ${resolve(root)}`;
  console.log(format === 'md' ? `# ${title}\n` : title);
  console.log(`Tool version: ${toolVersion}; applied: ${result.applied}`);
  for (const entry of result.entries) console.log(`- ${entry.status}: ${entry.path}`);
  const preserved = result.entries.filter(entry => ['unmanaged', 'modified', 'deleted', 'retired'].includes(entry.status));
  if (preserved.length) console.log(`Preserved existing files (review integration): ${preserved.map(entry => entry.path).join(', ')}`);
  const skipped = result.entries.filter(entry => entry.status === 'skipped');
  if (skipped.length) console.log(`Skipped optional files behind symlinks: ${skipped.map(entry => entry.path).join(', ')}`);
  if (result.transactionId) console.log(`Transaction: ${result.transactionId}`);
}

function diagnoseProject(rootInput: string) {
  const root = resolveKitRoot(rootInput);
  const manifestPath = join(root, 'harness/manifest.json');
  if (!existsSync(manifestPath)) return {
    toolVersion, root, ready: false, managed: false,
    findings: [{ severity: 'critical', code: 'manifest-missing', message: 'No harness manifest. Run harness-lab init --dry-run, then harness-lab init in the target project.' }],
    nextSteps: ['Initialize the project harness; customize rules and acceptance criteria before development.'],
  };
  const audit = auditRepoHarness(root);
  const mutationLocked = existsSync(join(root, '.harness-lab/lock'));
  const update = installKit(root, repoKitFiles(detectProjectProfiles(root)), { version: toolVersion, mode: 'update', apply: false, optional: optionalKitPaths, initOnly: sampleKitPaths });
  return {
    toolVersion, root, ready: !audit.blocked && !mutationLocked, managed: existsSync(join(root, '.harness-lab/state.json')),
    findings: [...audit.findings, ...(mutationLocked ? [{ severity: 'critical', code: 'mutation-lock-present', message: 'A mutation lock exists. Check for an active update or interrupted process before manually recovering the lock; do not delete an active lock.' }] : [])], update: update.entries,
    nextSteps: [
      ...(!existsSync(join(root, '.harness-lab/state.json')) ? ['No files are tracked yet, so update cannot refresh them. Move project-specific content into harness/project.md, then run harness-lab adopt and adopt --apply.'] : []),
      ...(!existsSync(join(root, 'harness/verify.json')) ? ['Create harness/verify.json with the project verification argv and existing source paths; init does not guess a test command.'] : []),
      'Review harness-lab update before applying template changes.',
      'Run project verification, check-evidence and audit after changes; audit warnings still need review.',
    ],
  };
}

function parseFrontmatter(content: string) {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string | string[]> = {};
  let index = 1;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '---') {
      index += 1;
      break;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }

    const [, rawKey, rawValue] = match;
    const key = rawKey.trim();
    const value = rawValue.trim();

    if (value.length > 0) {
      frontmatter[key] = value;
      index += 1;
      continue;
    }

    const values: string[] = [];
    index += 1;
    while (index < lines.length) {
      const itemLine = lines[index];
      const itemMatch = itemLine.match(/^\s*-\s+(.*)$/);
      if (!itemMatch) break;
      values.push(itemMatch[1].trim());
      index += 1;
    }
    frontmatter[key] = values;
  }

  return {
    frontmatter,
    body: lines.slice(index).join('\n'),
  };
}

function parseMarkdownSections(body: string) {
  const sections: Record<string, string> = {};
  const lines = body.split('\n');
  let current = '';
  let buffer: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections[current] = buffer.join('\n').trim();
      current = heading[1].trim();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }

  if (current) sections[current] = buffer.join('\n').trim();
  return sections;
}

function parseMarkdownDoc(filePath: string): ParsedMarkdownDoc {
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    path: filePath,
    frontmatter,
    sections: parseMarkdownSections(body),
    raw,
  };
}

function frontmatterString(doc: ParsedMarkdownDoc, key: string) {
  const value = doc.frontmatter[key];
  return typeof value === 'string' ? value : '';
}

function frontmatterList(doc: ParsedMarkdownDoc, key: string) {
  const value = doc.frontmatter[key];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) return [value.trim()];
  return [];
}

function bulletLines(section: string | undefined) {
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function markdownFilesIn(dirPath: string) {
  if (!existsSync(dirPath)) return [];

  const entries = readdirSync(dirPath)
    .map((name) => join(dirPath, name))
    .filter((entry) => statSync(entry).isFile() && extname(entry) === '.md')
    .sort();

  return entries;
}

function localMarkdownLinks(doc: ParsedMarkdownDoc) {
  const matches = [...doc.raw.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return matches
    .map((match) => match[1]?.trim() ?? '')
    .filter((target) => target.length > 0 && !target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('#'));
}

function resolveLocalDocPath(docPath: string, target: string) {
  const normalized = target.replace(/^<|>$/g, '').split(':')[0];
  if (normalized.startsWith('/')) return normalized;
  return resolve(dirname(docPath), normalized);
}

function resolveManifestInput(inputPath: string) {
  const absoluteInput = resolve(inputPath);
  if (!existsSync(absoluteInput)) {
    throw new Error(`Path not found: ${absoluteInput}`);
  }

  const stats = statSync(absoluteInput);
  if (stats.isDirectory()) {
    const manifestPath = join(absoluteInput, 'harness', 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Could not find harness manifest at ${manifestPath}`);
    }
    return {
      repoRoot: absoluteInput,
      manifestPath,
    };
  }

  const manifestPath = absoluteInput;
  const repoRoot = resolve(dirname(manifestPath), '..');
  return { repoRoot, manifestPath };
}

function addFinding(findings: AuditFinding[], severity: AuditFinding['severity'], code: string, message: string, path?: string) {
  findings.push({ severity, code, message, path });
}

function sectionMissing(doc: ParsedMarkdownDoc, sectionName: string) {
  return !doc.sections[sectionName] || doc.sections[sectionName].trim().length === 0;
}

function auditRepoHarness(inputPath: string): AuditResult {
  const { repoRoot, manifestPath } = resolveManifestInput(inputPath);
  const findings: AuditFinding[] = [];
  const detection = detectProjectProfiles(repoRoot);

  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const manifest = readJsonFile<RepoHarnessManifest>(manifestPath);
  assert(manifest.repoName, 'manifest.repoName is required');
  assert(manifest.paths, 'manifest.paths is required');
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'harness/workflow.md']) {
    const instructions = readTextIfExists(join(repoRoot, file)).trim();
    if (!instructions) {
      addFinding(findings, 'warning', 'agent-entry-missing', `Missing or empty agent workflow file: ${file}`, join(repoRoot, file));
    } else if (file !== 'harness/workflow.md' && !instructions.includes('harness/workflow.md')) {
      addFinding(findings, 'warning', 'agent-workflow-unlinked', `Agent instructions do not reference harness/workflow.md: ${file}. Preserve existing policy and integrate the shared workflow.`, join(repoRoot, file));
    } else if (file === 'CLAUDE.md' && !/(^|\s)@(\.\/)?harness\/workflow\.md(\s|$)/.test(instructions)) {
      addFinding(findings, 'warning', 'claude-workflow-not-imported', 'CLAUDE.md mentions harness/workflow.md without an @harness/workflow.md import, so Claude Code does not load it automatically.', join(repoRoot, file));
    }
  }
  const maintenancePath = join(repoRoot, 'harness/maintenance.json');
  try {
    const review = readJsonFile<{ reviewedAt: string | null; summary: string }>(maintenancePath);
    const reviewedAt = typeof review.reviewedAt === 'string' ? Date.parse(review.reviewedAt) : NaN;
    if (!Number.isFinite(reviewedAt) || reviewedAt > Date.now() || typeof review.summary !== 'string' || !review.summary.trim()) {
      addFinding(findings, 'warning', 'maintenance-review-required', 'Complete a harness simplification and improvement review; record reviewedAt and summary.', maintenancePath);
    } else if (Date.now() - reviewedAt > 30 * 86400000) {
      addFinding(findings, 'warning', 'maintenance-overdue', 'Harness maintenance review is older than 30 days.', maintenancePath);
    }
  } catch {
    addFinding(findings, 'warning', 'maintenance-review-required', 'Missing or invalid harness/maintenance.json.', maintenancePath);
  }
  const approvedPacks = manifest.approvedPacks ?? [];
  const manifestDetectedProfiles = manifest.detectedProfiles ?? [];
  const suggestedPacks = manifest.suggestedPacks ?? [];

  for (const relativeFile of manifest.requiredFiles ?? []) {
    const absolute = join(repoRoot, relativeFile);
    if (!existsSync(absolute)) {
      addFinding(findings, 'critical', 'required-file-missing', `Required file is missing: ${relativeFile}`, absolute);
    }
  }

  const specsDir = join(repoRoot, manifest.paths.specsDir);
  const adrsDir = join(repoRoot, manifest.paths.adrsDir);
  const contractsDir = join(repoRoot, manifest.paths.contractsDir);
  const rulesDir = join(repoRoot, manifest.paths.rulesDir);
  const specFiles = markdownFilesIn(specsDir);
  const adrFiles = markdownFilesIn(adrsDir);
  const contractFiles = markdownFilesIn(contractsDir);
  const goldenRulesText = readTextIfExists(join(rulesDir, 'golden-rules.md')).toLowerCase();
  const constraintsText = readTextIfExists(join(rulesDir, 'constraints.md')).toLowerCase();

  if (manifestDetectedProfiles.join('|') !== detection.detectedProfiles.join('|')) {
    addFinding(
      findings,
      'warning',
      'detected-profiles-drift',
      `Manifest detectedProfiles differ from current repository signals. manifest=${manifestDetectedProfiles.join(', ') || 'none'} current=${detection.detectedProfiles.join(', ') || 'none'}`,
      manifestPath,
    );
  }

  if (detection.suggestedPacks.join('|') !== suggestedPacks.join('|')) {
    addFinding(
      findings,
      'warning',
      'suggested-packs-drift',
      `Manifest suggestedPacks differ from current repository signals. manifest=${suggestedPacks.join(', ') || 'none'} current=${detection.suggestedPacks.join(', ') || 'none'}`,
      manifestPath,
    );
  }

  if (detection.suggestedPacks.length > 0 && approvedPacks.length === 0) {
    addFinding(
      findings,
      'warning',
      'approved-packs-missing',
      `Repository signals suggest profile packs (${detection.suggestedPacks.join(', ')}) but approvedPacks is empty. Review and approve the relevant packs.`,
      manifestPath,
    );
  }

  for (const approvedPackId of approvedPacks) {
    const pack = profilePacks[approvedPackId];
    if (!pack) {
      addFinding(findings, 'warning', 'approved-pack-unknown', `Approved pack is not recognized: ${approvedPackId}`, manifestPath);
      continue;
    }

    const hasKeyword = pack.auditKeywords.some((keyword) => goldenRulesText.includes(keyword) || constraintsText.includes(keyword));
    if (!hasKeyword) {
      addFinding(
        findings,
        'warning',
        'approved-pack-rules-mismatch',
        `Approved pack ${approvedPackId} is present but rules/constraints do not appear to encode its stack-specific guidance.`,
        rulesDir,
      );
    }
  }

  if (specFiles.length === 0) {
    addFinding(findings, 'critical', 'specs-missing', 'No feature specs were found.', specsDir);
  }

  if (adrFiles.length === 0) {
    addFinding(findings, 'warning', 'adrs-missing', 'No ADRs were found. Architectural decisions will be hard to enforce.', adrsDir);
  }

  if (contractFiles.length === 0) {
    addFinding(findings, 'warning', 'contracts-missing', 'No contracts were found. Specs are not yet bridged to chunk-level execution.', contractsDir);
  }

  const adrById = new Map<string, ParsedMarkdownDoc>();
  const contractById = new Map<string, ParsedMarkdownDoc>();
  const linkedSpecIds = new Set<string>();

  const docsToLinkCheck: ParsedMarkdownDoc[] = [];
  for (const adrFile of adrFiles) {
    const adrDoc = parseMarkdownDoc(adrFile);
    docsToLinkCheck.push(adrDoc);
    const adrId = frontmatterString(adrDoc, 'id');
    if (!adrId) {
      addFinding(findings, 'critical', 'adr-id-missing', 'ADR is missing frontmatter id.', adrFile);
      continue;
    }
    adrById.set(adrId, adrDoc);

    if (!frontmatterString(adrDoc, 'title')) {
      addFinding(findings, 'warning', 'adr-title-missing', 'ADR is missing frontmatter title.', adrFile);
    }
    if (sectionMissing(adrDoc, 'Context')) {
      addFinding(findings, 'critical', 'adr-context-missing', 'ADR is missing a Context section.', adrFile);
    }
    if (sectionMissing(adrDoc, 'Decision')) {
      addFinding(findings, 'critical', 'adr-decision-missing', 'ADR is missing a Decision section.', adrFile);
    }
    if (sectionMissing(adrDoc, 'Consequences')) {
      addFinding(findings, 'warning', 'adr-consequences-missing', 'ADR is missing a Consequences section.', adrFile);
    }

    for (const specId of frontmatterList(adrDoc, 'related_specs')) {
      linkedSpecIds.add(specId);
    }
  }

  for (const contractFile of contractFiles) {
    const contractDoc = parseMarkdownDoc(contractFile);
    docsToLinkCheck.push(contractDoc);
    const contractId = frontmatterString(contractDoc, 'id');
    if (!contractId) {
      addFinding(findings, 'critical', 'contract-id-missing', 'Contract is missing frontmatter id.', contractFile);
      continue;
    }
    contractById.set(contractId, contractDoc);

    if (!frontmatterString(contractDoc, 'title')) {
      addFinding(findings, 'warning', 'contract-title-missing', 'Contract is missing frontmatter title.', contractFile);
    }
    if (sectionMissing(contractDoc, 'Goal')) {
      addFinding(findings, 'critical', 'contract-goal-missing', 'Contract is missing a Goal section.', contractFile);
    }
    if (sectionMissing(contractDoc, 'Done Criteria')) {
      addFinding(findings, 'critical', 'contract-done-criteria-missing', 'Contract is missing Done Criteria.', contractFile);
    } else if (bulletLines(contractDoc.sections['Done Criteria']).length === 0) {
      addFinding(findings, 'critical', 'contract-done-criteria-empty', 'Contract Done Criteria must include at least one bullet.', contractFile);
    }
    if (sectionMissing(contractDoc, 'Verification')) {
      addFinding(findings, 'warning', 'contract-verification-missing', 'Contract is missing a Verification section.', contractFile);
    }
    if (sectionMissing(contractDoc, 'Evidence References')) {
      addFinding(findings, 'warning', 'contract-evidence-refs-missing', 'Contract is missing Evidence References.', contractFile);
    }

    for (const specId of frontmatterList(contractDoc, 'related_specs')) {
      linkedSpecIds.add(specId);
    }

    const evidenceFiles = frontmatterList(contractDoc, 'evidence_files');
    if (evidenceFiles.length === 0) {
      addFinding(findings, 'warning', 'contract-evidence-files-missing', 'Contract should declare evidence_files in frontmatter.', contractFile);
    }
    for (const evidenceFile of evidenceFiles) {
      const absoluteEvidence = resolve(repoRoot, evidenceFile);
      if (!existsSync(absoluteEvidence)) {
        addFinding(findings, 'warning', 'evidence-file-missing', `Evidence file not found: ${evidenceFile}`, contractFile);
      } else if (basename(absoluteEvidence) === 'checks.json') {
        const checked = checkEvidence(absoluteEvidence, repoRoot);
        if (!checked.valid) addFinding(findings, 'critical', 'execution-evidence-invalid', checked.issues.join('; '), contractFile);
      }
    }
  }

  for (const specFile of specFiles) {
    const specDoc = parseMarkdownDoc(specFile);
    docsToLinkCheck.push(specDoc);
    const specId = frontmatterString(specDoc, 'id');
    if (!specId) {
      addFinding(findings, 'critical', 'spec-id-missing', 'Feature spec is missing frontmatter id.', specFile);
    }
    if (!frontmatterString(specDoc, 'title')) {
      addFinding(findings, 'warning', 'spec-title-missing', 'Feature spec is missing frontmatter title.', specFile);
    }
    if (sectionMissing(specDoc, 'Problem')) {
      addFinding(findings, 'critical', 'spec-problem-missing', 'Feature spec is missing a Problem section.', specFile);
    }
    if (sectionMissing(specDoc, 'Scope')) {
      addFinding(findings, 'warning', 'spec-scope-missing', 'Feature spec is missing a Scope section.', specFile);
    }
    if (sectionMissing(specDoc, 'Acceptance Criteria')) {
      addFinding(findings, 'critical', 'spec-acceptance-missing', 'Feature spec is missing Acceptance Criteria.', specFile);
    } else if (bulletLines(specDoc.sections['Acceptance Criteria']).length === 0) {
      addFinding(findings, 'critical', 'spec-acceptance-empty', 'Acceptance Criteria must include at least one bullet.', specFile);
    }
    if (sectionMissing(specDoc, 'Constraints')) {
      addFinding(findings, 'warning', 'spec-constraints-missing', 'Feature spec is missing a Constraints section.', specFile);
    }
    if (sectionMissing(specDoc, 'Evidence')) {
      addFinding(findings, 'warning', 'spec-evidence-missing', 'Feature spec is missing an Evidence section.', specFile);
    }

    const relatedAdrs = frontmatterList(specDoc, 'related_adrs');
    const relatedContracts = frontmatterList(specDoc, 'related_contracts');
    if (relatedAdrs.length === 0) {
      addFinding(findings, 'warning', 'spec-related-adrs-missing', 'Feature spec does not link any ADRs.', specFile);
    }
    if (relatedContracts.length === 0) {
      addFinding(findings, 'warning', 'spec-related-contracts-missing', 'Feature spec does not link any contracts.', specFile);
    }

    for (const adrId of relatedAdrs) {
      const adrDoc = adrById.get(adrId);
      if (!adrDoc) {
        addFinding(findings, 'critical', 'spec-related-adr-not-found', `Linked ADR not found: ${adrId}`, specFile);
        continue;
      }
      const relatedSpecs = frontmatterList(adrDoc, 'related_specs');
      if (!relatedSpecs.includes(specId)) {
        addFinding(
          findings,
          'warning',
          'adr-backlink-missing',
          `ADR ${adrId} does not reference feature spec ${specId} in related_specs.`,
          adrDoc.path,
        );
      }
    }

    for (const contractId of relatedContracts) {
      const contractDoc = contractById.get(contractId);
      if (!contractDoc) {
        addFinding(findings, 'critical', 'spec-related-contract-not-found', `Linked contract not found: ${contractId}`, specFile);
        continue;
      }
      const relatedSpecs = frontmatterList(contractDoc, 'related_specs');
      if (!relatedSpecs.includes(specId)) {
        addFinding(
          findings,
          'warning',
          'contract-backlink-missing',
          `Contract ${contractId} does not reference feature spec ${specId} in related_specs.`,
          contractDoc.path,
        );
      }

      const evidenceFiles = frontmatterList(contractDoc, 'evidence_files');
      const requiredEvidence = frontmatterList(specDoc, 'required_evidence');
      if (requiredEvidence.length > 0 && evidenceFiles.length === 0) {
        addFinding(findings, 'warning', 'required-evidence-unmapped', 'Feature spec requires evidence but linked contract declares no evidence_files.', contractDoc.path);
      }
    }

    if (specId && !linkedSpecIds.has(specId)) {
      addFinding(findings, 'warning', 'orphaned-spec', `Feature spec ${specId} is not referenced by any ADR or contract backlink.`, specFile);
    }
  }

  for (const doc of docsToLinkCheck) {
    for (const target of localMarkdownLinks(doc)) {
      const absoluteTarget = resolveLocalDocPath(doc.path, target);
      if (!existsSync(absoluteTarget)) {
        addFinding(findings, 'warning', 'broken-local-link', `Broken local link: ${target}`, doc.path);
      }
    }
  }

  if (manifest.policyMode === 'strict-block') {
    for (const finding of findings) {
      if (finding.severity === 'warning') finding.severity = 'critical';
    }
  }

  const summary = {
    specs: specFiles.length,
    adrs: adrFiles.length,
    contracts: contractFiles.length,
    critical: findings.filter((finding) => finding.severity === 'critical').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    info: findings.filter((finding) => finding.severity === 'info').length,
  };

  return {
    repoName: manifest.repoName,
    manifestPath,
    policyMode: manifest.policyMode,
    blocked: manifest.policyMode !== 'advisory' && summary.critical > 0,
    stackSummary: manifest.stackSummary ?? detection.stackSummary,
    detectedProfiles: detection.detectedProfiles,
    approvedPacks,
    summary,
    findings,
  };
}

function formatAuditText(result: AuditResult) {
  const lines = [
    `Harness Audit: ${result.repoName}`,
    `Manifest: ${result.manifestPath}`,
    `Policy mode: ${result.policyMode}`,
    `Stack summary: ${result.stackSummary ?? 'n/a'}`,
    `Detected profiles: ${result.detectedProfiles && result.detectedProfiles.length > 0 ? result.detectedProfiles.join(', ') : 'none'}`,
    `Approved packs: ${result.approvedPacks && result.approvedPacks.length > 0 ? result.approvedPacks.join(', ') : 'none'}`,
    `Blocked: ${result.blocked ? 'yes' : 'no'}`,
    `Specs: ${result.summary.specs}`,
    `ADRs: ${result.summary.adrs}`,
    `Contracts: ${result.summary.contracts}`,
    `Critical: ${result.summary.critical}`,
    `Warnings: ${result.summary.warnings}`,
    '',
    'Findings:',
  ];

  if (result.findings.length === 0) {
    lines.push('- none');
    return lines.join('\n');
  }

  for (const finding of result.findings) {
    lines.push(`- [${finding.severity}] ${finding.code}: ${finding.message}`);
    if (finding.path) lines.push(`  path: ${finding.path}`);
  }

  return lines.join('\n');
}

function formatAuditMarkdown(result: AuditResult) {
  return [
    '# Harness Audit Report',
    '',
    `- Repo: ${result.repoName}`,
    `- Manifest: ${result.manifestPath}`,
    `- Policy mode: ${result.policyMode}`,
    `- Stack summary: ${result.stackSummary ?? 'n/a'}`,
    `- Detected profiles: ${result.detectedProfiles && result.detectedProfiles.length > 0 ? result.detectedProfiles.join(', ') : 'none'}`,
    `- Approved packs: ${result.approvedPacks && result.approvedPacks.length > 0 ? result.approvedPacks.join(', ') : 'none'}`,
    `- Blocked: ${result.blocked ? 'yes' : 'no'}`,
    `- Specs: ${result.summary.specs}`,
    `- ADRs: ${result.summary.adrs}`,
    `- Contracts: ${result.summary.contracts}`,
    `- Critical findings: ${result.summary.critical}`,
    `- Warnings: ${result.summary.warnings}`,
    '',
    '## Findings',
    '',
    ...(result.findings.length === 0
      ? ['- none']
      : result.findings.map((finding) =>
          `- [${finding.severity}] ${finding.code}: ${finding.message}${finding.path ? ` (${finding.path})` : ''}`,
        )),
  ].join('\n');
}

function resolveRelatedAdrPaths(specPath: string, relatedAdrs: string[]) {
  const adrsDir = resolve(dirname(specPath), '..', 'adrs');
  const matches: Array<{ id: string; title: string; status: string; path: string }> = [];

  for (const adrId of relatedAdrs) {
    const directPath = join(adrsDir, `${adrId}.md`);
    if (!existsSync(directPath)) continue;
    const adrDoc = parseMarkdownDoc(directPath);
    matches.push({
      id: adrId,
      title: frontmatterString(adrDoc, 'title') || basename(directPath),
      status: frontmatterString(adrDoc, 'status') || 'unknown',
      path: directPath,
    });
  }

  return matches;
}

function resolveRelatedContractPaths(specPath: string, relatedContracts: string[]) {
  const contractsDir = resolve(dirname(specPath), '..', 'contracts');
  const matches: Array<{ id: string; title: string; status: string; path: string }> = [];

  for (const contractId of relatedContracts) {
    const directPath = join(contractsDir, `${contractId}.md`);
    if (!existsSync(directPath)) continue;
    const contractDoc = parseMarkdownDoc(directPath);
    matches.push({
      id: contractId,
      title: frontmatterString(contractDoc, 'title') || basename(directPath),
      status: frontmatterString(contractDoc, 'status') || 'unknown',
      path: directPath,
    });
  }

  return matches;
}

function buildPlan(specPath: string): PlanResult {
  const absoluteSpecPath = resolve(specPath);
  if (!existsSync(absoluteSpecPath)) {
    throw new Error(`Spec file not found: ${absoluteSpecPath}`);
  }

  const specDoc = parseMarkdownDoc(absoluteSpecPath);
  const relatedAdrs = resolveRelatedAdrPaths(absoluteSpecPath, frontmatterList(specDoc, 'related_adrs'));
  const relatedContracts = resolveRelatedContractPaths(absoluteSpecPath, frontmatterList(specDoc, 'related_contracts'));
  const acceptanceCriteria = bulletLines(specDoc.sections['Acceptance Criteria']);
  const constraints = bulletLines(specDoc.sections['Constraints']);
  const requiredEvidence = frontmatterList(specDoc, 'required_evidence').concat(bulletLines(specDoc.sections['Evidence']));
  const blockers: string[] = [];

  if (acceptanceCriteria.length === 0) blockers.push('Acceptance Criteria is empty.');
  if (!specDoc.sections['Problem']) blockers.push('Problem section is missing.');
  if (frontmatterList(specDoc, 'related_adrs').length > 0 && relatedAdrs.length === 0) {
    blockers.push('Linked ADRs were declared but could not be resolved.');
  }
  if (frontmatterList(specDoc, 'related_contracts').length > 0 && relatedContracts.length === 0) {
    blockers.push('Linked contracts were declared but could not be resolved.');
  }

  const executionOrder = [
    `Read spec intent and acceptance criteria from ${absoluteSpecPath}.`,
    ...relatedAdrs.map((adr) => `Read ADR ${adr.id} before design or implementation decisions.`),
    ...relatedContracts.map((contract) => `Read contract ${contract.id} to lock the chunk-level done criteria.`),
    'Reconcile spec requirements with repo constraints and golden rules.',
    'Implement the smallest change that satisfies acceptance criteria.',
    'Collect required evidence and record any escalation points.',
  ];

  return {
    specPath: absoluteSpecPath,
    title: frontmatterString(specDoc, 'title') || basename(absoluteSpecPath),
    status: frontmatterString(specDoc, 'status') || 'unknown',
    relatedAdrs,
    relatedContracts,
    acceptanceCriteria,
    constraints,
    requiredEvidence,
    blockers,
    executionOrder,
  };
}

function formatPlanText(result: PlanResult) {
  const lines = [
    `Harness Plan: ${result.title}`,
    `Spec: ${result.specPath}`,
    `Status: ${result.status}`,
    '',
    'Execution order:',
    ...result.executionOrder.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Acceptance criteria:',
    ...(result.acceptanceCriteria.length > 0 ? result.acceptanceCriteria.map((item) => `- ${item}`) : ['- none']),
    '',
    'Constraints:',
    ...(result.constraints.length > 0 ? result.constraints.map((item) => `- ${item}`) : ['- none']),
    '',
    'Related ADRs:',
    ...(result.relatedAdrs.length > 0
      ? result.relatedAdrs.map((adr) => `- ${adr.id} (${adr.status}): ${adr.title}`)
      : ['- none']),
    '',
    'Related contracts:',
    ...(result.relatedContracts.length > 0
      ? result.relatedContracts.map((contract) => `- ${contract.id} (${contract.status}): ${contract.title}`)
      : ['- none']),
    '',
    'Required evidence:',
    ...(result.requiredEvidence.length > 0 ? result.requiredEvidence.map((item) => `- ${item}`) : ['- none']),
    '',
    'Blockers:',
    ...(result.blockers.length > 0 ? result.blockers.map((item) => `- ${item}`) : ['- none']),
  ];

  return lines.join('\n');
}

function formatPlanMarkdown(result: PlanResult) {
  return [
    '# Harness Plan',
    '',
    `- Title: ${result.title}`,
    `- Spec: ${result.specPath}`,
    `- Status: ${result.status}`,
    '',
    '## Execution Order',
    '',
    ...result.executionOrder.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## Acceptance Criteria',
    '',
    ...(result.acceptanceCriteria.length > 0 ? result.acceptanceCriteria.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Constraints',
    '',
    ...(result.constraints.length > 0 ? result.constraints.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Related ADRs',
    '',
    ...(result.relatedAdrs.length > 0
      ? result.relatedAdrs.map((adr) => `- ${adr.id} (${adr.status}): ${adr.title}`)
      : ['- none']),
    '',
    '## Related Contracts',
    '',
    ...(result.relatedContracts.length > 0
      ? result.relatedContracts.map((contract) => `- ${contract.id} (${contract.status}): ${contract.title}`)
      : ['- none']),
    '',
    '## Required Evidence',
    '',
    ...(result.requiredEvidence.length > 0 ? result.requiredEvidence.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Blockers',
    '',
    ...(result.blockers.length > 0 ? result.blockers.map((item) => `- ${item}`) : ['- none']),
  ].join('\n');
}

function printUsage() {
  console.log(`harness-lab ${toolVersion}
Usage:
  harness-lab --version
  harness-lab init [repo] [--dry-run] [--format text|json|md]
  harness-lab adopt [repo] [--apply] [--format text|json|md]
  harness-lab update [repo] [--apply] [--format text|json|md]
  harness-lab rollback <transaction-id> [repo] [--apply]
  harness-lab doctor [repo] [--format text|json|md]
  harness-lab verify [repo] [config.json] [--output <directory>]
  harness verify <repo> <config.json> --output <directory>
  harness check-evidence <checks.json> <repo>
  harness run <spec.json> [--format text|json|md]
  harness maturity <spec.json> [--format text|json|md]
  harness report <spec.json> [--format text|json|md] [--output <path>]
  harness detect <repo> [--format text|json|md] [--output <path>]
  harness init engineering [--output <path>]
  harness init repo-kit [--output <directory>]
  harness audit <manifest-or-repo> [--format text|json|md] [--output <path>]
  harness plan <feature-spec.md> [--format text|json|md] [--output <path>]
`);
}

function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) { printUsage(); return; }
    if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) { console.log(toolVersion); return; }
    const { command, positionals, options } = parseArgs(argv);

    if (command === 'verify') {
      if (positionals.length > 2) throw new Error('verify [repo] [config.json] [--output <directory>]');
      const root = resolve(positionals[0] ?? '.');
      const config = positionals[1] ?? join(root, 'harness/verify.json');
      if (!existsSync(config)) throw new Error(`Verification config not found: ${config}. Create harness/verify.json with a trusted command argv and existing inputs.`);
      const evidence = collectEvidence(root, config, options.output ?? join(root, 'out/evidence/latest'));
      console.log(JSON.stringify(evidence, null, 2));
      if (!evidence.passed) process.exitCode = 1;
      return;
    }
    if (command === 'check-evidence') {
      if (!positionals[0] || !positionals[1]) throw new Error('check-evidence <checks.json> <repo>');
      const checked = checkEvidence(positionals[0], positionals[1]);
      console.log(JSON.stringify(checked, null, 2));
      if (!checked.valid) process.exitCode = 1;
      return;
    }

    if (!command || command === '--help' || command === '-h') {
      printUsage();
      return;
    }

    if (command === 'init') {
      const target = positionals[0];
      if (target === 'engineering') {
        if (options.dryRun) throw new Error('--dry-run is only supported for project initialization');
        const output = JSON.stringify(starterSpec(), null, 2);
        writeOutput(output, options.output);
        return;
      }
      if (positionals.length > 1 || (target && target !== 'repo-kit' && options.output)) throw new Error('init [repo] or init repo-kit --output <directory>');
      const root = options.output ?? (target === 'repo-kit' ? '.' : target ?? '.');
      const { absoluteRoot, detection, result } = initRepoKit(root, !options.dryRun);
      printKitResult(options.dryRun ? 'Initialization preview' : 'Initialized repo kit', absoluteRoot, result, options.format);
      if (options.format !== 'json') console.log(`Detected stack: ${detection.stackSummary}`);
      return;
    }

    if (command === 'adopt') {
      if (options.output || positionals.length > 1) throw new Error('adopt [repo] [--apply]');
      const root = resolveKitRoot(positionals[0] ?? '.');
      const result = installKit(root, repoKitFiles(detectProjectProfiles(root)), { version: toolVersion, mode: 'adopt', apply: !!options.apply, optional: optionalKitPaths, initOnly: sampleKitPaths });
      printKitResult(`Adoption ${options.apply ? 'result' : 'preview'}`, root, result, options.format);
      const customized = result.entries.filter(entry => entry.status === 'unmanaged' && managedKitPaths.includes(entry.path)).map(entry => entry.path);
      if (options.format !== 'json' && customized.length) console.log(`Managed files differ from the template: ${customized.join(', ')}. Move project-specific content into harness/project.md (or rules, specs, ADRs), restore the template text, and run adopt again.`);
      return;
    }

    if (command === 'update' || command === 'rollback') {
      if (options.output) throw new Error('--output is not supported for update or rollback; preview writes no files');
      const rollback = command === 'rollback';
      if (positionals.length > (rollback ? 2 : 1) || (rollback && !positionals[0])) throw new Error(rollback ? 'rollback <transaction-id> [repo] [--apply]' : 'update [repo] [--apply]');
      const root = resolveKitRoot(positionals[rollback ? 1 : 0] ?? '.');
      const files = repoKitFiles(detectProjectProfiles(root));
      const result = rollback
        ? rollbackKit(root, positionals[0], Object.keys(files), !!options.apply, optionalKitPaths)
        : installKit(root, files, { version: toolVersion, mode: 'update', apply: !!options.apply, optional: optionalKitPaths, initOnly: sampleKitPaths });
      printKitResult(`${rollback ? 'Rollback' : 'Project update'} ${options.apply ? 'result' : 'preview'}`, root, result, options.format);
      return;
    }

    if (command === 'doctor') {
      if (positionals.length > 1 || options.output) throw new Error('doctor [repo] [--format text|json|md]');
      const result = diagnoseProject(positionals[0] ?? '.');
      if (options.format === 'json') console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`${options.format === 'md' ? '# ' : ''}Harness doctor: ${result.root}`);
        console.log(`Tool ${toolVersion}; ${result.managed ? 'tracked installation' : 'unmanaged project files'}; ${result.ready ? 'no blocking audit findings' : 'setup required or blocked'}`);
        for (const finding of result.findings) console.log(`- ${finding.severity}: ${finding.code}: ${finding.message}`);
        for (const step of result.nextSteps) console.log(`- Next: ${step}`);
      }
      if (!result.ready) process.exitCode = 1;
      return;
    }

    const inputPath = positionals[0];
    if (!inputPath) throw new Error(`Command "${command}" requires an input path.`);

    if (command === 'detect') {
      const detection = detectProjectProfiles(inputPath);
      const output =
        options.format === 'json'
          ? JSON.stringify(detection, null, 2)
          : options.format === 'md'
            ? formatDetectMarkdown(detection)
            : formatDetectText(detection);
      writeOutput(output, options.output);
      return;
    }

    if (command === 'audit') {
      const result = auditRepoHarness(inputPath);
      writeOutput(serialize(options.format, result), options.output);
      if (result.blocked) process.exitCode = 1;
      return;
    }

    if (command === 'plan') {
      writeOutput(serialize(options.format, buildPlan(inputPath)), options.output);
      return;
    }

    const spec = readJsonFile<HarnessSpec>(inputPath);

    if (command === 'run') {
      console.error('MOCK evaluation: supplied outputs and heuristic design scores; no agent execution.');
      writeOutput(serialize(options.format, { ...runHarness(spec), evaluationMode: 'mock', agentExecuted: false }), options.output);
      return;
    }

    if (command === 'maturity') {
      console.error('Heuristic maturity assessment includes self-declared evidence; not runtime certification.');
      writeOutput(serialize(options.format, assessMaturity(spec)), options.output);
      return;
    }

    if (command === 'report') {
      console.error('MOCK evaluation; maturity includes self-declared evidence, not runtime certification.');
      const runReport = runHarness(spec);
      const maturity = assessMaturity(spec, runReport);
      const output =
        options.format === 'json'
          ? JSON.stringify({ runReport, maturity }, null, 2)
          : options.format === 'md'
            ? `${formatRunReportMarkdown(runReport)}\n\n---\n\n${formatMaturityMarkdown(maturity)}`
            : `${formatRunReportText(runReport)}\n\n${formatMaturityText(maturity)}`;
      writeOutput(output, options.output);
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
