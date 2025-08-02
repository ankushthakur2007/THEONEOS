import React from 'react';
import { Button } from '@/components/ui/button';
import { Paperclip, X, Loader2, AlertCircle } from 'lucide-react';

export type UploadStatus = 'uploading' | 'success' | 'error' | 'idle';

interface FilePreviewProps {
  file: File;
  previewUrl: string | null;
  status: UploadStatus;
  onRemove: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, previewUrl, status, onRemove }) => {
  return (
    <div className="relative mb-2 p-2 border rounded-lg bg-muted/50 flex items-center gap-3 animate-slide-up-fade">
      {previewUrl ? (
        <img src={previewUrl} alt="File preview" className="h-12 w-12 rounded object-cover" />
      ) : (
        <div className="h-12 w-12 bg-muted rounded flex items-center justify-center">
          <Paperclip className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="text-sm text-muted-foreground truncate flex-1">
        {file.name}
        <div className="text-xs">{(file.size / 1024).toFixed(2)} KB</div>
      </div>
      
      <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center" hidden={status !== 'uploading' && status !== 'error'}>
        {status === 'uploading' && <Loader2 className="h-6 w-6 text-white animate-spin" />}
        {status === 'error' && <AlertCircle className="h-6 w-6 text-destructive" />}
      </div>

      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 z-10" onClick={onRemove}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};