export type Grade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "D" | "F";
export type JobStatus = "draft" | "running" | "ready" | "error";
export type Platform = "youtube" | "tiktok" | "instagram";

export type Pattern = { name: string; description: string; evidence: string };

export type VideoAnalysis = {
  hookText: string;
  hookLabel: string;
  formula: string;
  psychology: string[];
  triggerWords: string[];
  structureNotes: string;
  visualHook: string;
  bodyBeats: { name: string; summary: string; approxSec: number }[];
  cta: string | null;
  tone: string;
  whyItWorks: string;
};

export type Source = {
  id: string;
  url: string;
  platform: Platform;
  status: "pending" | "running" | "done" | "error";
  step: string | null;
  error: string | null;
  warnings: string[];
  via: string[];
  video: {
    title: string | null;
    author: string | null;
    durationSec: number | null;
    views: number | null;
    likes: number | null;
  } | null;
  transcriptSource: "captions" | "whisper" | "none" | null;
  pacing: { shots: number; cutsPerMinute: number; avgShotSec: number } | null;
  analysis: VideoAnalysis | null;
};

export type Insights = {
  styleSummary: string;
  voice: {
    tone: string;
    persona: string;
    sentenceStyle: string;
    vocabulary: string[];
    avoid: string[];
  };
  hookFormats: {
    label: string;
    original: string;
    formula: string;
    sourceId: string | null;
    whyItWorks: string;
  }[];
  patterns: {
    psychology: Pattern[];
    triggerWords: Pattern[];
    grammar: Pattern[];
    pacingAndVisual: Pattern[];
  };
  structureTemplate: { name: string; purpose: string; typicalSec: number }[];
  ctaPatterns: string[];
  customPrinciples: Pattern[];
};

export type Principle = {
  name: string;
  description: string;
  source: "universal" | "profile";
  evidence?: string;
};

export type Profile = {
  id: string;
  name: string;
  language: "th" | "en";
  createdAt: string;
  status: JobStatus;
  step: string | null;
  error: string | null;
  mock: boolean;
  sources: Source[];
  insights: Insights | null;
  rubric: Principle[];
};

export type ProfileSummary = {
  id: string;
  name: string;
  language: "th" | "en";
  status: JobStatus;
  createdAt: string;
  sourceCount: number;
  doneCount: number;
  mock: boolean;
};

export type ScriptBeat = {
  section: "hook" | "problem" | "solution" | "demo" | "proof" | "cta";
  startSec: number;
  endSec: number;
  voiceover: string;
  imageIndex: number | null;
};

export type VoiceScores = {
  total: number;
  intelligibility: number | null;
  pacing: number;
  style: number | null;
  technical: number;
  reason: string | null;
  details: {
    errorRate: number | null;
    rate: number;
    rateUnit: "words" | "chars";
    durationSec: number;
    silenceRatio: number;
    clipRatio: number;
  };
};

export type VoiceTake = {
  id: string;
  styleId: string;
  styleName: string;
  status: "pending" | "running" | "done" | "error";
  error: string | null;
  durationSec: number | null;
  transcript: string | null;
  scores: VoiceScores | null;
  userRating: number | null;
  recommended: boolean;
};

export type VoiceState = {
  status: JobStatus;
  step: string | null;
  error: string | null;
  mock: boolean;
  settings: { language: string; model: string; voice: string; styleIds: string[] };
  spokenText: string | null;
  takes: VoiceTake[];
  createdAt: string;
};

export type VoiceOptions = {
  defaults: { language: string; model: string; voice: string; styles: string[] };
  maxStyles: number;
  models: {
    id: string;
    label: string;
    note: string;
    supportsInstructions: boolean;
    recommended: boolean;
    voices: { id: string; recommended: boolean }[];
  }[];
  languages: { code: string; name: string; label: string }[];
  styles: { id: string; label: string; summary: string; speed: number }[];
  deprecation: { shutdownDate: string; successor: string; message: string };
  disclosure: string;
};

export type Project = {
  id: string;
  profileId: string;
  title: string;
  createdAt: string;
  status: JobStatus;
  step: string | null;
  error: string | null;
  mock: boolean;
  language: "th" | "en";
  input: { notes: string; productUrl: string | null; durationSec: number; images: string[] };
  brief: { productName: string; category: string; audience: string; keywords: string[] } | null;
  research: {
    facts: { claim: string; source: "user" | "image" | "web"; sourceUrl: string | null }[];
    sellingPoints: string[];
    painPoints: string[];
    objections: string[];
    claimsToVerify: string[];
    sources: { title: string; url: string }[];
    warnings: string[];
  } | null;
  hooks: {
    formatMatched: { formatLabel: string; text: string; grade: Grade; note: string }[];
    skippedFormats: { formatLabel: string; reason: string }[];
    original: { text: string; grade: Grade; note: string }[];
  } | null;
  chosenHook: string | null;
  script: {
    title: string;
    totalSec: number;
    beats: ScriptBeat[];
    caption: string;
    hashtags: string[];
  } | null;
  voice?: VoiceState;
  review: {
    input: string;
    result: {
      lines: { line: string; grade: Grade; comment: string }[];
      overall: Grade;
      summary: string;
      rewrites: { text: string; grade: Grade; whyStronger: string }[];
    };
  } | null;
};

export type ProjectSummary = {
  id: string;
  title: string;
  status: JobStatus;
  createdAt: string;
  productName: string | null;
  thumbnail: string | null;
};

export type Capabilities = {
  agentReach: boolean;
  ytDlp: boolean;
  ffmpeg: boolean;
  ai: boolean;
  mockAi: boolean;
  maxSources: number;
};
