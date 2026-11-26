import type {
  ApprovalDetailDto,
  ApprovalDto,
  ApprovalDecisionRequest,
  DocumentDto,
  DocumentUploadIntent,
  DocumentUploadRequest,
  ExecutionDto,
  ExecutionDetailDto,
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
  RetryExecutionRequest,
} from "@flowpilot/shared";

export interface IssuedAuthTokens {
  readonly user: User;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthService {
  register(input: RegisterRequest): Promise<IssuedAuthTokens>;
  login(input: LoginRequest): Promise<IssuedAuthTokens>;
  refresh(rawRefreshToken: string): Promise<IssuedAuthTokens | null>;
  verifyAccessToken(rawAccessToken: string): User | null;
  logout(rawRefreshToken: string | undefined): Promise<void>;
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
  uploadDocument(
    userId: string,
    workspaceId: string,
    documentId: string,
    input: {
      readonly bytes: Uint8Array;
      readonly contentType: string;
    },
  ): Promise<DocumentDto>;
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
  list(userId: string, workspaceId: string): Promise<ExecutionDto[]>;
  get(
    userId: string,
    workspaceId: string,
    executionId: string,
  ): Promise<ExecutionDetailDto | null>;
  retry(
    userId: string,
    workspaceId: string,
    executionId: string,
    input: RetryExecutionRequest,
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
