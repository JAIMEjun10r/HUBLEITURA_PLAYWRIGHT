export interface RepositoryInfo {
  owner: string;
  repo: string;
  fullName: string;
  private: boolean;
  visibility: "public" | "private" | "internal";
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

export interface Branch {
  name: string;
  protected: boolean;
}

export interface WorkflowInput {
  name: string;
  description: string;
  required: boolean;
  type: "string" | "boolean" | "choice" | "environment";
  default?: string | boolean;
  options: string[];
}

export interface Actor {
  login: string;
  avatar_url?: string;
  html_url?: string;
}

export interface Run {
  id: number;
  run_number: number;
  run_attempt: number;
  workflow_id: number;
  name: string;
  display_title: string;
  event: string;
  status: string;
  conclusion: string | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  html_url: string;
  actor: Actor | null;
}

export interface Job {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}

export interface Artifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  expires_at: string;
}
