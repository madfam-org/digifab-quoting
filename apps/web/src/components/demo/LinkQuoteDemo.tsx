'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Link as LinkIcon,
  Search,
  CheckCircle,
  AlertCircle,
  Zap,
  Eye,
  ShoppingCart,
  ExternalLink,
  Copy,
  Clock,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LinkAnalysis {
  id: string;
  url: string;
  status: 'pending' | 'fetching' | 'parsing' | 'analyzing' | 'pricing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  project?: {
    title: string;
    description: string;
    difficulty: string;
    estimatedTime: number;
    images: string[];
  };
  bom?: {
    totalItems: number;
    estimatedCost: number;
    categories: string[];
    items: Array<{
      name: string;
      quantity: number;
      category: string;
      unitCost?: number;
      manufacturingMethod?: string;
      material?: string;
    }>;
  };
  quotes?: Array<{
    persona: string;
    totalCost: number;
    leadTime: number;
    recommendations: Array<{
      component: {
        name: string;
        quantity: number;
      };
      costBreakdown: {
        total: number;
      };
    }>;
  }>;
}

const DEMO_LINKS = [
  {
    name: 'Arduino Weather Station',
    url: 'https://www.instructables.com/Arduino-Weather-Station-DHT22/',
    description: 'Complete IoT weather monitoring system',
    expectedItems: 8,
    estimatedCost: '$67',
  },
  {
    name: 'Raspberry Pi Camera Mount',
    url: 'https://www.thingiverse.com/thing:3532690',
    description: '3D printable adjustable camera mount',
    expectedItems: 3,
    estimatedCost: '$12',
  },
  {
    name: 'CNC Router Build',
    url: 'https://www.hackster.io/diylab/diy-cnc-router-build-guide-8a5c34',
    description: 'Complete CNC router construction guide',
    expectedItems: 45,
    estimatedCost: '$890',
  },
];

export function LinkQuoteDemo() {
  const [url, setUrl] = useState('');
  const [analysis, setAnalysis] = useState<LinkAnalysis | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string>('diy_maker');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyzeLink = useCallback(async (linkUrl: string) => {
    setIsAnalyzing(true);
    setUrl(linkUrl);

    // Create initial analysis object
    const newAnalysis: LinkAnalysis = {
      id: Date.now().toString(),
      url: linkUrl,
      status: 'pending',
      progress: 0,
      message: 'Initializing analysis...',
    };

    setAnalysis(newAnalysis);

    // Simulate the analysis process
    const stages = [
      { status: 'fetching', progress: 15, message: 'Fetching content from URL...', delay: 1000 },
      { status: 'parsing', progress: 35, message: 'Parsing project information...', delay: 1500 },
      {
        status: 'analyzing',
        progress: 65,
        message: 'Analyzing BOM and components...',
        delay: 2000,
      },
      {
        status: 'pricing',
        progress: 85,
        message: 'Generating personalized quotes...',
        delay: 1500,
      },
      { status: 'completed', progress: 100, message: 'Analysis completed!', delay: 1000 },
    ];

    for (const stage of stages) {
      await new Promise((resolve) => setTimeout(resolve, stage.delay));

      let updatedAnalysis = {
        ...newAnalysis,
        status: stage.status as LinkAnalysis['status'],
        progress: stage.progress,
        message: stage.message,
      };

      // Add mock data when completed
      if (stage.status === 'completed') {
        const mockProject = getMockProject(linkUrl);
        updatedAnalysis = {
          ...updatedAnalysis,
          project: mockProject.project,
          bom: mockProject.bom,
          quotes: mockProject.quotes,
        };
      }

      setAnalysis(updatedAnalysis);
    }

    setIsAnalyzing(false);
  }, []);

  const getMockProject = (url: string) => {
    const isArduino = url.includes('arduino') || url.includes('weather');
    const is3DPrint = url.includes('thingiverse') || url.includes('mount');

    if (isArduino) {
      return {
        project: {
          title: 'Arduino Weather Station',
          description:
            'A complete IoT weather monitoring system with DHT22 sensor, LCD display, and WiFi connectivity.',
          difficulty: 'intermediate',
          estimatedTime: 4,
          images: ['/api/placeholder/300/200'],
        },
        bom: {
          totalItems: 8,
          estimatedCost: 67.5,
          categories: ['electronics', '3d_printed', 'wiring'],
          items: [
            { name: 'Arduino Uno R3', quantity: 1, category: 'electronics', unitCost: 25.99 },
            {
              name: 'DHT22 Temperature Sensor',
              quantity: 1,
              category: 'electronics',
              unitCost: 12.5,
            },
            { name: '16x2 LCD Display', quantity: 1, category: 'electronics', unitCost: 8.99 },
            { name: 'ESP8266 WiFi Module', quantity: 1, category: 'electronics', unitCost: 6.75 },
            {
              name: 'Enclosure Housing',
              quantity: 1,
              category: '3d_printed',
              unitCost: 8.5,
              manufacturingMethod: '3D Printing FFF',
              material: 'PETG',
            },
            { name: 'Jumper Wires', quantity: 20, category: 'wiring', unitCost: 0.15 },
            { name: 'Breadboard', quantity: 1, category: 'electronics', unitCost: 3.99 },
            { name: 'Power Supply 9V', quantity: 1, category: 'electronics', unitCost: 7.99 },
          ],
        },
        quotes: [
          {
            persona: 'diy_maker',
            totalCost: 89.2,
            leadTime: 5,
            recommendations: [
              {
                component: { name: 'Enclosure Housing', quantity: 1 },
                costBreakdown: { total: 12.5 },
              },
            ],
          },
          {
            persona: 'professional_shop',
            totalCost: 124.8,
            leadTime: 3,
            recommendations: [
              {
                component: { name: 'Enclosure Housing', quantity: 1 },
                costBreakdown: { total: 28.5 },
              },
            ],
          },
        ],
      };
    }

    if (is3DPrint) {
      return {
        project: {
          title: 'Raspberry Pi Camera Mount',
          description: 'Adjustable 3D printable camera mount with pan/tilt functionality.',
          difficulty: 'beginner',
          estimatedTime: 2,
          images: ['/api/placeholder/300/200'],
        },
        bom: {
          totalItems: 3,
          estimatedCost: 12.5,
          categories: ['3d_printed', 'hardware'],
          items: [
            {
              name: 'Main Mount Body',
              quantity: 1,
              category: '3d_printed',
              unitCost: 8.5,
              manufacturingMethod: '3D Printing FFF',
              material: 'PLA',
            },
            {
              name: 'Pan/Tilt Mechanism',
              quantity: 1,
              category: '3d_printed',
              unitCost: 6.2,
              manufacturingMethod: '3D Printing FFF',
              material: 'PLA',
            },
            { name: 'M3x12mm Screws', quantity: 4, category: 'hardware', unitCost: 0.25 },
          ],
        },
        quotes: [
          {
            persona: 'diy_maker',
            totalCost: 18.9,
            leadTime: 2,
            recommendations: [
              {
                component: { name: 'Main Mount Body', quantity: 1 },
                costBreakdown: { total: 12.5 },
              },
            ],
          },
        ],
      };
    }

    // Default CNC project
    return {
      project: {
        title: 'DIY CNC Router Build',
        description: 'Complete guide for building a desktop CNC router with 300x300mm work area.',
        difficulty: 'advanced',
        estimatedTime: 40,
        images: ['/api/placeholder/300/200'],
      },
      bom: {
        totalItems: 45,
        estimatedCost: 890.0,
        categories: ['cnc_parts', '3d_printed', 'electronics', 'hardware'],
        items: [
          { name: 'Aluminum Extrusion 2020', quantity: 8, category: 'cnc_parts', unitCost: 12.5 },
          { name: 'Linear Rails', quantity: 6, category: 'cnc_parts', unitCost: 25.99 },
          { name: 'Stepper Motors NEMA23', quantity: 3, category: 'electronics', unitCost: 45.0 },
          { name: 'Spindle Motor', quantity: 1, category: 'electronics', unitCost: 189.99 },
          { name: 'Control Board', quantity: 1, category: 'electronics', unitCost: 89.99 },
        ],
      },
      quotes: [
        {
          persona: 'professional_shop',
          totalCost: 1247.5,
          leadTime: 14,
          recommendations: [
            {
              component: { name: 'Custom Brackets', quantity: 8 },
              costBreakdown: { total: 156.0 },
            },
          ],
        },
      ],
    };
  };

  const handleCopyUrl = (linkUrl: string) => {
    navigator.clipboard.writeText(linkUrl);
  };

  const getStatusColor = (status: LinkAnalysis['status']) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      case 'pending':
        return 'text-gray-600';
      default:
        return 'text-blue-600';
    }
  };

  const getStatusIcon = (status: LinkAnalysis['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* URL Input */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-2 flex items-center">
              <LinkIcon className="w-6 h-6 mr-2 text-blue-600" />
              Analyze Maker Project Link
            </h3>
            <p className="text-gray-600">
              Paste a link from Instructables, Thingiverse, GitHub, or other maker platforms to
              automatically extract the bill of materials and get instant quotes.
            </p>
          </div>

          <div className="flex space-x-2">
            <Input
              type="url"
              placeholder="https://www.instructables.com/your-project..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              disabled={isAnalyzing}
            />
            <Button
              onClick={() => handleAnalyzeLink(url)}
              disabled={!url || isAnalyzing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Search className="w-4 h-4 mr-2" />
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </Button>
          </div>

          {/* Persona Selection */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium">Optimize for:</span>
            <div className="flex space-x-2">
              {[
                { key: 'diy_maker', label: 'DIY Maker' },
                { key: 'professional_shop', label: 'Professional' },
                { key: 'educator', label: 'Education' },
              ].map((persona) => (
                <Button
                  key={persona.key}
                  variant={selectedPersona === persona.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedPersona(persona.key)}
                  disabled={isAnalyzing}
                >
                  {persona.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Demo Links */}
      <div>
        <h4 className="text-lg font-semibold mb-4">Try with Example Projects</h4>
        <div className="grid md:grid-cols-3 gap-4">
          {DEMO_LINKS.map((link, index) => (
            <Card key={index} className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <div className="space-y-3">
                <div>
                  <h5 className="font-semibold">{link.name}</h5>
                  <p className="text-sm text-gray-600">{link.description}</p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{link.expectedItems} components</span>
                  <span className="font-medium text-green-600">{link.estimatedCost}</span>
                </div>

                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAnalyzeLink(link.url)}
                    disabled={isAnalyzing}
                    className="flex-1"
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Analyze
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleCopyUrl(link.url)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Analysis Results */}
      <AnimatePresence>
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Progress Card */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center">
                    {getStatusIcon(analysis.status)}
                    <span className="ml-2">Analysis Progress</span>
                  </h3>
                  <Badge variant="outline" className={getStatusColor(analysis.status)}>
                    {analysis.status.charAt(0).toUpperCase() + analysis.status.slice(1)}
                  </Badge>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span>{analysis.message}</span>
                    <span>{analysis.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <motion.div
                      className="h-2 bg-blue-600 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${analysis.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>

                <div className="flex items-center text-sm text-gray-600">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  <span className="truncate">{analysis.url}</span>
                </div>
              </div>
            </Card>

            {/* Project Info */}
            {analysis.project && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Project Information</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-3">
                    <h4 className="text-xl font-bold">{analysis.project.title}</h4>
                    <p className="text-gray-600">{analysis.project.description}</p>

                    <div className="flex items-center space-x-4">
                      <Badge variant="outline">{analysis.project.difficulty}</Badge>
                      <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-1" />
                        {analysis.project.estimatedTime}h build time
                      </div>
                    </div>
                  </div>

                  {analysis.project.images && analysis.project.images[0] && (
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                        <Eye className="w-8 h-8 text-gray-400" />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* BOM Summary */}
            {analysis.bom && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Bill of Materials</h3>
                  <div className="flex items-center text-lg font-bold text-green-600">
                    <DollarSign className="w-5 h-5" />
                    {analysis.bom.estimatedCost.toFixed(2)}
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{analysis.bom.totalItems}</div>
                    <div className="text-sm text-gray-600">Components</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{analysis.bom.categories.length}</div>
                    <div className="text-sm text-gray-600">Categories</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {analysis.bom.items.filter((item) => item.manufacturingMethod).length}
                    </div>
                    <div className="text-sm text-gray-600">Custom Parts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {analysis.bom.items.filter((item) => !item.manufacturingMethod).length}
                    </div>
                    <div className="text-sm text-gray-600">Standard Parts</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {analysis.bom.items.slice(0, 5).map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm text-gray-600">
                            {item.quantity}x • {item.category}
                            {item.manufacturingMethod && (
                              <span className="ml-2 text-blue-600">
                                • {item.manufacturingMethod}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {item.unitCost && (
                        <div className="text-right">
                          <div className="font-medium">${item.unitCost.toFixed(2)}</div>
                          <div className="text-sm text-gray-600">each</div>
                        </div>
                      )}
                    </div>
                  ))}

                  {analysis.bom.items.length > 5 && (
                    <div className="text-center py-2">
                      <Button variant="outline" size="sm">
                        View All {analysis.bom.items.length} Items
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Quotes */}
            {analysis.quotes && analysis.quotes.length > 0 && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Personalized Quotes</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {analysis.quotes.map((quote, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold capitalize">
                          {quote.persona.replace('_', ' ')}
                        </h4>
                        <Badge variant="outline">{quote.leadTime} days</Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Total Cost:</span>
                          <span className="font-bold text-lg">${quote.totalCost.toFixed(2)}</span>
                        </div>

                        <Button className="w-full" variant="outline">
                          <ShoppingCart className="w-4 h-4 mr-2" />
                          Convert to Quote
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Analysis State */}
      {!analysis && (
        <div className="text-center py-12">
          <LinkIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No Analysis Yet</h3>
          <p className="text-gray-500">
            Paste a maker project link above or try one of the example projects to get started.
          </p>
        </div>
      )}
    </div>
  );
}
