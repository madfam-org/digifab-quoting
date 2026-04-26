'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { Currency } from '@cotiza/shared';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/use-toast';
import { PriceDisplay } from '@/components/pricing/PriceDisplay';
import { CurrencySelector } from '@/components/currency/CurrencySelector';

interface ExchangeRate {
  base: Currency;
  target: Currency;
  rate: number;
  source: string;
  validFrom: string;
  validUntil: string;
  lastUpdated: string;
}

interface RateAlert {
  id: string;
  currency: Currency;
  changePercent: number;
  timestamp: string;
  type: 'increase' | 'decrease';
}

export default function CurrencyAdminPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // State for different sections
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [alerts, setAlerts] = useState<RateAlert[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<Currency>(Currency.USD);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [updateInterval, setUpdateInterval] = useState('6');

  // Currency configuration
  const [enabledCurrencies, setEnabledCurrencies] = useState<Currency[]>([]);
  const [feeConfiguration, setFeeConfiguration] = useState({
    percentage: 0.5,
    fixed: 0.3,
  });

  useEffect(() => {
    loadDashboardData();
  }, [baseCurrency]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadExchangeRates(), loadAlerts(), loadConfiguration()]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load dashboard data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadExchangeRates = async () => {
    try {
      const response = await apiClient.get<{ rates: Record<Currency, number> }>(
        `/currency/rates?base=${baseCurrency}`,
      );

      // Convert to rate objects
      const rateObjects: ExchangeRate[] = Object.entries(response.rates).map(([target, rate]) => ({
        base: baseCurrency,
        target: target as Currency,
        rate,
        source: 'openexchangerates',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        lastUpdated: new Date().toISOString(),
      }));

      setExchangeRates(rateObjects);
    } catch (error) {
      console.error('Failed to load exchange rates:', error);
    }
  };

  const loadAlerts = async () => {
    // Mock alerts for demo
    const mockAlerts: RateAlert[] = [
      {
        id: '1',
        currency: Currency.EUR,
        changePercent: 2.5,
        timestamp: new Date().toISOString(),
        type: 'increase',
      },
      {
        id: '2',
        currency: Currency.MXN,
        changePercent: -1.8,
        timestamp: new Date().toISOString(),
        type: 'decrease',
      },
    ];
    setAlerts(mockAlerts);
  };

  const loadConfiguration = async () => {
    // Load enabled currencies and fee configuration
    setEnabledCurrencies(Object.values(Currency));
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      await apiClient.post('/currency/admin/refresh-rates');
      toast({
        title: 'Success',
        description: 'Exchange rates refreshed successfully',
      });
      await loadExchangeRates();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to refresh exchange rates',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleCurrency = (currency: Currency) => {
    setEnabledCurrencies((prev) => {
      if (prev.includes(currency)) {
        return prev.filter((c) => c !== currency);
      }
      return [...prev, currency];
    });
  };

  const handleSaveConfiguration = async () => {
    try {
      await apiClient.post('/admin/currency/configuration', {
        enabledCurrencies,
        feeConfiguration,
        autoUpdateEnabled,
        updateInterval: parseInt(updateInterval),
      });

      toast({
        title: 'Success',
        description: 'Configuration saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save configuration',
        variant: 'destructive',
      });
    }
  };

  const renderRateChange = (_rate: ExchangeRate) => {
    // Calculate mock change
    const change = (Math.random() - 0.5) * 5;
    const isPositive = change > 0;

    return (
      <div className="flex items-center gap-1">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )}
        <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
          {Math.abs(change).toFixed(2)}%
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Currency Management</h1>
          <p className="text-muted-foreground">
            Manage exchange rates, currencies, and conversion settings
          </p>
        </div>
        <div className="flex items-center gap-4">
          <CurrencySelector value={baseCurrency} onChange={setBaseCurrency} size="sm" />
          <Button onClick={handleForceRefresh} disabled={refreshing} variant="outline">
            {refreshing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Rates
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              Rate Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {alert.type === 'increase' ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <span className="font-medium">{alert.currency}</span>
                    <span className="text-sm text-muted-foreground">
                      {alert.type === 'increase' ? 'increased' : 'decreased'} by{' '}
                      {Math.abs(alert.changePercent).toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Currencies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enabledCurrencies.length}</div>
            <p className="text-xs text-muted-foreground">
              of {Object.values(Currency).length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Update</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5" />
              2h ago
            </div>
            <p className="text-xs text-muted-foreground">Next update in 4 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversions Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,234</div>
            <p className="text-xs text-muted-foreground">+12% from yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">94.5%</div>
            <p className="text-xs text-muted-foreground">Optimal performance</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="rates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="rates">Exchange Rates</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Exchange Rates Tab */}
        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle>Current Exchange Rates</CardTitle>
              <CardDescription>
                Base currency: {baseCurrency} · Last updated: {new Date().toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>1000 {baseCurrency}</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exchangeRates.map((rate) => (
                    <TableRow key={rate.target}>
                      <TableCell className="font-medium">{rate.target}</TableCell>
                      <TableCell>{rate.rate.toFixed(4)}</TableCell>
                      <TableCell>{renderRateChange(rate)}</TableCell>
                      <TableCell>
                        <PriceDisplay
                          amount={1000 * rate.rate}
                          currency={rate.target}
                          variant="minimal"
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>{rate.source}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="flex items-center gap-1 w-fit">
                          <CheckCircle className="h-3 w-3" />
                          Active
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle>Currency Configuration</CardTitle>
              <CardDescription>Enable or disable currencies for your platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base">Enabled Currencies</Label>
                <div className="grid grid-cols-4 gap-4 mt-3">
                  {Object.values(Currency).map((currency) => (
                    <div key={currency} className="flex items-center justify-between">
                      <Label htmlFor={currency} className="text-sm font-normal">
                        {currency}
                      </Label>
                      <Switch
                        checked={enabledCurrencies.includes(currency)}
                        onCheckedChange={() => handleToggleCurrency(currency)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-base">Conversion Fees</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="percentage">Percentage Fee (%)</Label>
                    <Input
                      id="percentage"
                      type="number"
                      step="0.01"
                      value={feeConfiguration.percentage}
                      onChange={(e) =>
                        setFeeConfiguration((prev) => ({
                          ...prev,
                          percentage: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="fixed">Fixed Fee (USD)</Label>
                    <Input
                      id="fixed"
                      type="number"
                      step="0.01"
                      value={feeConfiguration.fixed}
                      onChange={(e) =>
                        setFeeConfiguration((prev) => ({
                          ...prev,
                          fixed: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveConfiguration}>Save Configuration</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Metrics</CardTitle>
              <CardDescription>
                Performance and usage statistics for currency conversions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Top Currency Pairs</h3>
                  <div className="space-y-2">
                    {[
                      { from: Currency.USD, to: Currency.EUR, count: 456 },
                      { from: Currency.USD, to: Currency.MXN, count: 324 },
                      { from: Currency.EUR, to: Currency.GBP, count: 198 },
                    ].map((pair) => (
                      <div
                        key={`${pair.from}-${pair.to}`}
                        className="flex items-center justify-between"
                      >
                        <span className="text-sm">
                          {pair.from} → {pair.to}
                        </span>
                        <Badge variant="secondary">{pair.count} conversions</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Performance Metrics</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">Avg Conversion Time</span>
                      <span className="text-sm font-medium">12ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Cache Hit Rate</span>
                      <span className="text-sm font-medium">94.5%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Error Rate</span>
                      <span className="text-sm font-medium">0.02%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">API Latency (p95)</span>
                      <span className="text-sm font-medium">45ms</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Update Settings</CardTitle>
              <CardDescription>Configure automatic exchange rate updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Automatic Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically fetch latest exchange rates
                  </p>
                </div>
                <Switch checked={autoUpdateEnabled} onCheckedChange={setAutoUpdateEnabled} />
              </div>

              {autoUpdateEnabled && (
                <div>
                  <Label htmlFor="interval">Update Interval (hours)</Label>
                  <Select value={updateInterval} onValueChange={setUpdateInterval}>
                    <SelectTrigger id="interval">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every hour</SelectItem>
                      <SelectItem value="3">Every 3 hours</SelectItem>
                      <SelectItem value="6">Every 6 hours</SelectItem>
                      <SelectItem value="12">Every 12 hours</SelectItem>
                      <SelectItem value="24">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>API Provider</Label>
                <Select defaultValue="openexchange">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openexchange">Open Exchange Rates</SelectItem>
                    <SelectItem value="fixer">Fixer.io</SelectItem>
                    <SelectItem value="currencylayer">Currency Layer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSaveConfiguration}>Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
