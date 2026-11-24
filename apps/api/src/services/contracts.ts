import type {
  ApprovalDetailDto,
  ApprovalDto,
  ApprovalDecisionRequest,
  DocumentDto,
  DocumentUploadIntent,
  DocumentUploadRequest,
  ExecutionDto,
  LoginRequest,
  RegisterRequest,
  ReportDto,
  User,
  Workspace,
  SaveWorkflowRequest,
  WorkflowDto,
  WorkflowProposal,
  WorkflowProposalRequest,
  StartExecutionRequest,
} from "@flowpilot/shared";

export interface IssuedSession {
  readonly user: User;
  readonly sessionToken: string;
}

export interface AuthService {
  register(input: RegisterRequest): Promise<IssuedSession>;
  login(input: LoginRequest): Promise<IssuedSession>;
  resolveSession(tokenHash: string): Promise<User | null>;
  revokeSession(tokenHash: string): Promise<void>;
}

export interface WorkspaceService {
  list(userId: string): Promise<Workspace[]>;
  create(userId: string, name: string): Promise<Workspace>;
  rename(userId: string, workspaceId: string, name: string): Promise<Workspace | null>;
  verifyOwner(userId: string, workspaceId: string): Promise<boolean>;
}

export interface DocumentService {
  list(userId: string, workspaceId: string): Promise<DocumentDto[]>;
  createUploadIntent(
    userId: string,
    workspaceId: string,
    input: DocumentUploadRequest,
  ): Promise<DocumentUploadIntent>;
  completeUpload(
    userId: string,
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentDto>;
  requestDeletion(
    userId: string,
    workspaceId: string,
    documentId: string,
  ): Promise<void>;
}

export interface WorkflowService {
  propose(
    userId: string,
    workspaceId: string,
    input: WorkflowProposalRequest,
  ): Promise<WorkflowProposal>;
  list(userId: string, workspaceId: string): Promise<WorkflowDto[]>;
  create(
    userId: string,
    workspaceId: string,
    input: SaveWorkflowRequest,
  ): Promise<WorkflowDto>;
  get(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowDto | null>;
  update(
    userId: string,
    workspaceId: string,
    workflowId: string,
    expectedRevision: number,
    input: SaveWorkflowRequest,
  ): Promise<WorkflowDto>;
}

export interface ExecutionService {
  start(
    userId: string,
    workspaceId: string,
    workflowId: string,
    idempotencyKey: string,
    input: StartExecutionRequest,
  ): Promise<ExecutionDto>;
}

export interface ReportService {
  list(userId: string, workspaceId: string): Promise<ReportDto[]>;
  get(userId: string, workspaceId: string, reportId: string): Promise<ReportDto | null>;
}

export interface ApprovalService {
  list(userId: string, workspaceId: string, status?: string): Promise<ApprovalDto[]>;
  get(
    userId: string,
    workspaceId: string,
    approvalId: string,
  ): Promise<ApprovalDetailDto | null>;
  decide(
    userId: string,
    workspaceId: string,
    approvalId: string,
    input: ApprovalDecisionRequest,
  ): Promise<ApprovalDto>;
}
