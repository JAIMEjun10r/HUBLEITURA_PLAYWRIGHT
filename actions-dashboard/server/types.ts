export type WorkflowInputType = "string" | "boolean" | "choice" | "environment";

export interface WorkflowInputDefinition {
  name: string;
  description: string;
  required: boolean;
  type: WorkflowInputType;
  default?: string | boolean;
  options: string[];
}

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export interface GitHubRepository {
  full_name: string;
  private: boolean;
  visibility: "public" | "private" | "internal";
  html_url: string;
}

export interface GitHubActor {
  login: string;
  avatar_url?: string;
  html_url?: string;
}

export interface GitHubRun {
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
  actor: GitHubActor | null;
}

export interface GitHubJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}

export interface GitHubArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  created_at: string;
  expires_at: string;
}

export interface DispatchResponse {
  workflow_run_id?: number;
  run_url?: string;
  html_url?: string;
}

export interface RunQuery {
  workflowId?: number;
  branch?: string;
  event?: string;
  actor?: string;
  perPage?: number;
}
