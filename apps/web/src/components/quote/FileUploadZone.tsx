'use client';

import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedFileTypes?: string[];
  className?: string;
}

export function FileUploadZone({
  onFilesSelected,
  maxFiles = 10,
  maxSizeMB = 50,
  acceptedFileTypes = ['.stl', '.step', '.stp', '.iges', '.igs', '.dxf'],
  className,
}: FileUploadZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setErrors([]);

      // Check for rejected files
      if (fileRejections.length > 0) {
        const errorMessages = fileRejections.map((rejection) => {
          const error = rejection.errors[0];
          if (error.code === 'file-too-large') {
            return `${rejection.file.name} is too large (max ${maxSizeMB}MB)`;
          }
          if (error.code === 'file-invalid-type') {
            return `${rejection.file.name} is not a supported file type`;
          }
          return `${rejection.file.name}: ${error.message}`;
        });
        setErrors(errorMessages);
      }

      // Add accepted files
      if (acceptedFiles.length > 0) {
        const newFiles = [...files, ...acceptedFiles].slice(0, maxFiles);
        setFiles(newFiles);
        onFilesSelected(newFiles);
      }
    },
    [files, maxFiles, maxSizeMB, onFilesSelected],
  );

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes.reduce(
      (acc, type) => {
        acc[`model/${type.slice(1)}`] = [type];
        return acc;
      },
      {} as Record<string, string[]>,
    ),
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles: maxFiles - files.length,
  });

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400',
          files.length >= maxFiles && 'opacity-50 cursor-not-allowed',
        )}
      >
        <input {...getInputProps()} disabled={files.length >= maxFiles} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        {isDragActive ? (
          <p className="text-lg font-medium">Drop the files here...</p>
        ) : (
          <>
            <p className="text-lg font-medium mb-2">Drag & drop files here, or click to select</p>
            <p className="text-sm text-gray-500">
              Supported formats: {acceptedFileTypes.join(', ')}
            </p>
            <p className="text-sm text-gray-500">
              Max size: {maxSizeMB}MB per file | Max files: {maxFiles}
            </p>
          </>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mt-4 space-y-2">
          {errors.map((error, index) => (
            <div
              key={index}
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm"
            >
              {error}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-gray-50 rounded-md px-4 py-2"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeFile(index)} className="ml-2">
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
