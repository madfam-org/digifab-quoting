'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  File,
  CheckCircle,
  AlertCircle,
  Zap,
  Eye,
  Download,
  RotateCcw,
} from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  type: string;
  status: 'uploading' | 'analyzing' | 'completed' | 'error';
  progress: number;
  analysis?: {
    volume: string;
    surfaceArea: string;
    complexity: 'Simple' | 'Medium' | 'Complex';
    materialRecommendation: string;
    estimatedCost: string;
    leadTime: string;
  };
  preview?: string;
}

const DEMO_FILES: UploadedFile[] = [
  {
    id: '1',
    name: 'phone-case-design.stl',
    size: '2.4 MB',
    type: 'STL',
    status: 'completed',
    progress: 100,
    analysis: {
      volume: '15.2 cm³',
      surfaceArea: '48.7 cm²',
      complexity: 'Simple',
      materialRecommendation: 'PETG',
      estimatedCost: '$12.50',
      leadTime: '2 days',
    },
  },
  {
    id: '2',
    name: 'drone-propeller.step',
    size: '5.8 MB',
    type: 'STEP',
    status: 'completed',
    progress: 100,
    analysis: {
      volume: '28.9 cm³',
      surfaceArea: '124.3 cm²',
      complexity: 'Medium',
      materialRecommendation: 'Carbon Fiber PETG',
      estimatedCost: '$45.20',
      leadTime: '3 days',
    },
  },
];

export function FileUploadDemo() {
  const [files, setFiles] = useState<UploadedFile[]>(DEMO_FILES);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    processFiles(selectedFiles);
  }, []);

  const processFiles = (fileList: File[]) => {
    setIsProcessing(true);

    fileList.forEach((file, index) => {
      const newFile: UploadedFile = {
        id: Date.now() + index + '',
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        type: file.name.split('.').pop()?.toUpperCase() || 'Unknown',
        status: 'uploading',
        progress: 0,
      };

      setFiles((prev) => [...prev, newFile]);

      // Simulate upload progress
      const uploadInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === newFile.id) {
              const newProgress = Math.min(f.progress + Math.random() * 30, 100);
              if (newProgress >= 100) {
                clearInterval(uploadInterval);
                // Start analysis
                setTimeout(() => {
                  setFiles((prev) =>
                    prev.map((file) =>
                      file.id === newFile.id ? { ...file, status: 'analyzing' } : file,
                    ),
                  );

                  // Complete analysis
                  setTimeout(() => {
                    setFiles((prev) =>
                      prev.map((file) =>
                        file.id === newFile.id
                          ? {
                              ...file,
                              status: 'completed',
                              analysis: {
                                volume: (Math.random() * 50 + 5).toFixed(1) + ' cm³',
                                surfaceArea: (Math.random() * 200 + 20).toFixed(1) + ' cm²',
                                complexity: ['Simple', 'Medium', 'Complex'][
                                  Math.floor(Math.random() * 3)
                                ] as 'Simple' | 'Medium' | 'Complex',
                                materialRecommendation: ['PLA', 'PETG', 'ABS', 'Carbon Fiber'][
                                  Math.floor(Math.random() * 4)
                                ],
                                estimatedCost: '$' + (Math.random() * 100 + 10).toFixed(2),
                                leadTime: Math.floor(Math.random() * 7 + 1) + ' days',
                              },
                            }
                          : file,
                      ),
                    );
                    setIsProcessing(false);
                  }, 2000);
                }, 1000);
              }
              return { ...f, progress: newProgress };
            }
            return f;
          }),
        );
      }, 200);
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      <div
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept=".stl,.step,.stp,.obj,.ply,.3mf"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <motion.div
          animate={{
            scale: isDragOver ? 1.05 : 1,
            rotate: isDragOver ? 5 : 0,
          }}
          className="space-y-4"
        >
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2">
              {isDragOver ? 'Drop your files here!' : 'Upload Your 3D Files'}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag & drop or click to select STL, STEP, OBJ files
            </p>
            <div className="text-sm text-gray-500">
              Supported formats: STL, STEP, STP, OBJ, PLY, 3MF • Max 50MB each
            </div>
          </div>
        </motion.div>

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white/90 rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="font-semibold">Processing files...</p>
            </div>
          </div>
        )}
      </div>

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h3 className="text-lg font-semibold">Your Files ({files.length})</h3>

            <div className="space-y-3">
              {files.map((file) => (
                <motion.div
                  key={file.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white border rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2 rounded-lg ${
                          file.status === 'completed'
                            ? 'bg-green-100'
                            : file.status === 'error'
                              ? 'bg-red-100'
                              : 'bg-blue-100'
                        }`}
                      >
                        <File
                          className={`w-5 h-5 ${
                            file.status === 'completed'
                              ? 'text-green-600'
                              : file.status === 'error'
                                ? 'text-red-600'
                                : 'text-blue-600'
                          }`}
                        />
                      </div>

                      <div>
                        <div className="font-semibold">{file.name}</div>
                        <div className="text-sm text-gray-500">
                          {file.size} • {file.type}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {file.status === 'completed' && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {file.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}

                      <button
                        onClick={() => removeFile(file.id)}
                        className="text-gray-400 hover:text-gray-600 p-1"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {(file.status === 'uploading' || file.status === 'analyzing') && (
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">
                          {file.status === 'uploading' ? 'Uploading...' : 'Analyzing...'}
                        </span>
                        <span className="text-gray-600">{Math.round(file.progress)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <motion.div
                          className={`h-2 rounded-full ${
                            file.status === 'analyzing' ? 'bg-purple-500' : 'bg-blue-500'
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${file.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Analysis Results */}
                  {file.status === 'completed' && file.analysis && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.5 }}
                      className="border-t pt-4 mt-4"
                    >
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Geometry Info */}
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center">
                            <Eye className="w-4 h-4 mr-2" />
                            Geometry Analysis
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Volume:</span>
                              <span className="font-medium">{file.analysis.volume}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Surface Area:</span>
                              <span className="font-medium">{file.analysis.surfaceArea}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Complexity:</span>
                              <span
                                className={`font-medium ${
                                  file.analysis.complexity === 'Simple'
                                    ? 'text-green-600'
                                    : file.analysis.complexity === 'Medium'
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {file.analysis.complexity}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Quote Info */}
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center">
                            <Zap className="w-4 h-4 mr-2" />
                            Quick Quote
                          </h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Recommended:</span>
                              <span className="font-medium">
                                {file.analysis.materialRecommendation}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Estimated Cost:</span>
                              <span className="font-bold text-green-600">
                                {file.analysis.estimatedCost}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Lead Time:</span>
                              <span className="font-medium">{file.analysis.leadTime}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex space-x-3 mt-4">
                        <button className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center">
                          <Download className="w-4 h-4 mr-2" />
                          Get Full Quote
                        </button>
                        <button className="flex-1 border border-gray-300 py-2 px-4 rounded-lg font-semibold hover:bg-gray-50 transition-colors flex items-center justify-center">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Try Different Material
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo CTA */}
      {files.length === 0 && (
        <div className="text-center">
          <p className="text-gray-600 mb-4">No files yet? Try our demo with sample files</p>
          <button
            onClick={() => {
              const sampleFiles: File[] = [];
              if (typeof File !== 'undefined') {
                try {
                  // Use type assertion for File constructor compatibility
                  const FileConstructor = File as unknown as new (
                    bits: BlobPart[],
                    filename: string,
                    options?: FilePropertyBag,
                  ) => File;
                  sampleFiles.push(
                    new FileConstructor([new Blob()], 'sample-bracket.stl', {
                      type: 'application/octet-stream',
                    }),
                    new FileConstructor([new Blob()], 'custom-enclosure.step', {
                      type: 'application/step',
                    }),
                  );
                } catch (error) {
                  console.warn('File constructor not available, using mock files');
                }
              }
              processFiles(sampleFiles);
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Try with Sample Files
          </button>
        </div>
      )}
    </div>
  );
}
