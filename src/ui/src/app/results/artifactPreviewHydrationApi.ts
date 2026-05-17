import type { SciForgeConfig, PreviewDescriptor, RuntimeArtifact } from '../../domain';
import {
  cachedWorkspaceFileReadError,
  readPreviewDerivative,
  readPreviewDescriptor,
  readWorkspaceFile,
  type WorkspaceFileContent,
} from '../../api/workspaceClient';
import {
  descriptorDerivativeKind,
  descriptorWithDiagnostic,
  mergePreviewDescriptors,
  normalizeArtifactPreviewDescriptor,
  shouldHydratePreviewDescriptor,
} from './previewDescriptor';

const WORKSPACE_OBJECT_PREVIEW_TIMEOUT_MS = 8_000;
const WORKSPACE_OBJECT_INLINE_PREVIEW_LIMIT_BYTES = 1024 * 1024;

export interface ArtifactPreviewHydrationApi {
  hydrateWorkspaceObjectPreview(input: {
    artifact?: RuntimeArtifact;
    path: string;
    config: SciForgeConfig;
  }): Promise<WorkspaceObjectPreviewHydration>;
  loadDescriptorPreviewFile(input: {
    descriptor: PreviewDescriptor;
    config: SciForgeConfig;
  }): Promise<DescriptorPreviewFile>;
}

export interface WorkspaceObjectPreviewHydration {
  staticDescriptor?: PreviewDescriptor;
  descriptor?: PreviewDescriptor;
  file?: WorkspaceFileContent;
  error?: string;
  needsHydration: boolean;
}

export interface DescriptorPreviewFile {
  file: WorkspaceFileContent;
  label: string;
}

export function createWorkspacePreviewHydrationApi(): ArtifactPreviewHydrationApi {
  return {
    async hydrateWorkspaceObjectPreview(input) {
      const staticDescriptor = normalizeArtifactPreviewDescriptor(input.artifact, input.path);
      if (staticDescriptor && !shouldHydratePreviewDescriptor(staticDescriptor, input.path)) {
        return { staticDescriptor, descriptor: staticDescriptor, needsHydration: false };
      }
      const cachedFileError = staticDescriptor ? undefined : cachedWorkspaceFileReadError(input.path, input.config);
      if (cachedFileError) {
        return {
          staticDescriptor,
          error: workspacePreviewReadErrorMessage(undefined, cachedFileError, true),
          needsHydration: false,
        };
      }
      try {
        const descriptor = await withWorkspacePreviewTimeout(
          readPreviewDescriptor(input.path, input.config),
          `preview descriptor ${input.path}`,
        );
        return {
          staticDescriptor,
          descriptor: staticDescriptor ? mergePreviewDescriptors(staticDescriptor, descriptor) : descriptor,
          needsHydration: true,
        };
      } catch (descriptorError) {
        if (staticDescriptor) {
          return {
            staticDescriptor,
            descriptor: descriptorWithDiagnostic(staticDescriptor, descriptorError),
            needsHydration: true,
          };
        }
        try {
          const file = await withWorkspacePreviewTimeout(readWorkspaceFile(input.path, input.config), `workspace file ${input.path}`);
          return { file, needsHydration: true };
        } catch (fileError) {
          return {
            error: workspacePreviewReadErrorMessage(descriptorError, fileError),
            needsHydration: true,
          };
        }
      }
    },
    async loadDescriptorPreviewFile(input) {
      const shouldReadInline = input.descriptor.inlinePolicy === 'inline'
        && (input.descriptor.sizeBytes ?? 0) <= WORKSPACE_OBJECT_INLINE_PREVIEW_LIMIT_BYTES;
      if (shouldReadInline) {
        try {
          return { file: await readWorkspaceFile(input.descriptor.ref, input.config), label: 'inline' };
        } catch {
          // Fall through to derived preview; the descriptor endpoint may point at a file outside the normal workspace route.
        }
      }
      const derivativeKind = descriptorDerivativeKind(input.descriptor);
      const derivative = await readPreviewDerivative(input.descriptor.ref, derivativeKind, input.config);
      return { file: await readWorkspaceFile(derivative.ref, input.config), label: `${derivative.kind} derivative` };
    },
  };
}

export async function withWorkspacePreviewTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} 超过 ${Math.round(WORKSPACE_OBJECT_PREVIEW_TIMEOUT_MS / 1000)} 秒仍未返回。`));
    }, WORKSPACE_OBJECT_PREVIEW_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function workspacePreviewReadErrorMessage(descriptorError: unknown, fileError: unknown, cached = false) {
  const fileMessage = fileError instanceof Error ? fileError.message : String(fileError);
  const cachedNote = cached ? '（已缓存 stale 结果，避免重复请求）' : '';
  if (!descriptorError) return `已切换到备用预览，但仍无法读取：${fileMessage}${cachedNote}`;
  const descriptorMessage = descriptorError instanceof Error ? descriptorError.message : String(descriptorError);
  return `已切换到备用预览，但仍无法读取：${fileMessage}${cachedNote}；descriptor diagnostic: ${descriptorMessage}`;
}
