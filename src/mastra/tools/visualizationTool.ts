import { z } from 'zod';
import { Tool } from '@mastra/core';

const VisualizationInputSchema = z.object({
  data: z.array(z.record(z.any())).describe('The data to visualize'),
  columns: z.array(z.string()).describe('The column names of the data'),
  chartType: z.enum(['bar', 'line', 'scatter', 'pie', 'histogram', 'box']).describe('The type of chart to generate'),
  xAxis: z.string().describe('The column to use for the X-axis'),
  yAxis: z.string().describe('The column to use for the Y-axis'),
  title: z.string().optional().describe('The title of the chart'),
  options: z.object({
    color: z.string().optional().default('#3B82F6'),
    width: z.number().optional().default(800),
    height: z.number().optional().default(600),
    showLegend: z.boolean().optional().default(true),
  }).optional(),
});

const VisualizationOutputSchema = z.object({
  success: z.boolean(),
  chartData: z.any().optional().describe('The processed data for the chart'),
  chartConfig: z.object({
    type: z.string(),
    data: z.any(),
    options: z.any(),
  }).optional(),
  error: z.string().optional(),
  recommendations: z.array(z.string()).optional().describe('Suggestions for better visualization'),
});

export class VisualizationTool extends Tool<
  typeof VisualizationInputSchema,
  typeof VisualizationOutputSchema
> {
  name = 'visualizationTool';
  description = 'Generates chart configurations and data for data visualization';
  inputSchema = VisualizationInputSchema;
  outputSchema = VisualizationOutputSchema;

  async execute(input: z.infer<typeof VisualizationInputSchema>) {
    try {
      const { data, columns, chartType, xAxis, yAxis, title, options = {} } = input;
      
      // Validate inputs
      if (!columns.includes(xAxis)) {
        throw new Error(`X-axis column '${xAxis}' not found in data`);
      }
      if (!columns.includes(yAxis)) {
        throw new Error(`Y-axis column '${yAxis}' not found in data`);
      }

      // Process data for visualization
      const chartData = this.processDataForChart(data, xAxis, yAxis, chartType);
      
      // Generate chart configuration
      const chartConfig = this.generateChartConfig(chartType, chartData, xAxis, yAxis, title, options);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(data, columns, chartType, xAxis, yAxis);

      return {
        success: true,
        chartData,
        chartConfig,
        recommendations,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private processDataForChart(
    data: Record<string, any>[],
    xAxis: string,
    yAxis: string,
    chartType: string
  ) {
    if (chartType === 'bar' || chartType === 'line') {
      return this.processCategoricalData(data, xAxis, yAxis);
    } else if (chartType === 'scatter') {
      return this.processScatterData(data, xAxis, yAxis);
    } else if (chartType === 'pie') {
      return this.processPieData(data, xAxis, yAxis);
    } else if (chartType === 'histogram') {
      return this.processHistogramData(data, xAxis);
    } else if (chartType === 'box') {
      return this.processBoxData(data, xAxis, yAxis);
    }
    
    return data;
  }

  private processCategoricalData(data: Record<string, any>[], xAxis: string, yAxis: string) {
    const grouped = new Map<string, number[]>();
    
    data.forEach(row => {
      const xValue = row[xAxis]?.toString() || 'Unknown';
      const yValue = parseFloat(row[yAxis]);
      
      if (!isNaN(yValue)) {
        if (!grouped.has(xValue)) {
          grouped.set(xValue, []);
        }
        grouped.get(xValue)!.push(yValue);
      }
    });

    return Array.from(grouped.entries()).map(([xValue, yValues]) => ({
      x: xValue,
      y: yValues.reduce((sum, val) => sum + val, 0) / yValues.length, // Average
      count: yValues.length,
    }));
  }

  private processScatterData(data: Record<string, any>[], xAxis: string, yAxis: string) {
    return data
      .map(row => ({
        x: parseFloat(row[xAxis]),
        y: parseFloat(row[yAxis]),
      }))
      .filter(point => !isNaN(point.x) && !isNaN(point.y));
  }

  private processPieData(data: Record<string, any>[], xAxis: string, yAxis: string) {
    const grouped = new Map<string, number>();
    
    data.forEach(row => {
      const xValue = row[xAxis]?.toString() || 'Unknown';
      const yValue = parseFloat(row[yAxis]) || 0;
      
      grouped.set(xValue, (grouped.get(xValue) || 0) + yValue);
    });

    return Array.from(grouped.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }

  private processHistogramData(data: Record<string, any>[], xAxis: string) {
    const values = data
      .map(row => parseFloat(row[xAxis]))
      .filter(val => !isNaN(val));
    
    if (values.length === 0) return [];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(10, Math.ceil(Math.sqrt(values.length)));
    const binSize = (max - min) / binCount;
    
    const bins = new Array(binCount).fill(0);
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1);
      bins[binIndex]++;
    });
    
    return bins.map((count, index) => ({
      x: min + (index + 0.5) * binSize,
      y: count,
    }));
  }

  private processBoxData(data: Record<string, any>[], xAxis: string, yAxis: string) {
    const grouped = new Map<string, number[]>();
    
    data.forEach(row => {
      const xValue = row[xAxis]?.toString() || 'Unknown';
      const yValue = parseFloat(row[yAxis]);
      
      if (!isNaN(yValue)) {
        if (!grouped.has(xValue)) {
          grouped.set(xValue, []);
        }
        grouped.get(xValue)!.push(yValue);
      }
    });

    return Array.from(grouped.entries()).map(([xValue, yValues]) => {
      const sorted = yValues.sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q2 = sorted[Math.floor(sorted.length * 0.5)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      
      return {
        x: xValue,
        min: sorted[0],
        q1,
        median: q2,
        q3,
        max: sorted[sorted.length - 1],
      };
    });
  }

  private generateChartConfig(
    chartType: string,
    chartData: any,
    xAxis: string,
    yAxis: string,
    title: string = '',
    options: any = {}
  ) {
    const baseConfig = {
      type: chartType,
      data: chartData,
      options: {
        title: title || `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`,
        xAxis: { label: xAxis },
        yAxis: { label: yAxis },
        color: options.color || '#3B82F6',
        width: options.width || 800,
        height: options.height || 600,
        showLegend: options.showLegend !== false,
      },
    };

    // Add chart-specific configurations
    switch (chartType) {
      case 'bar':
        baseConfig.options.barWidth = 0.8;
        break;
      case 'line':
        baseConfig.options.lineWidth = 2;
        baseConfig.options.showPoints = true;
        break;
      case 'scatter':
        baseConfig.options.pointSize = 6;
        break;
      case 'pie':
        baseConfig.options.showPercentages = true;
        break;
      case 'histogram':
        baseConfig.options.barWidth = 1;
        break;
    }

    return baseConfig;
  }

  private generateRecommendations(
    data: Record<string, any>[],
    columns: string[],
    chartType: string,
    xAxis: string,
    yAxis: string
  ): string[] {
    const recommendations: string[] = [];
    
    // Check data types and suggest better chart types
    const xValues = data.map(row => row[xAxis]);
    const yValues = data.map(row => row[yAxis]);
    
    const xIsNumeric = xValues.some(val => typeof val === 'number' && !isNaN(val));
    const yIsNumeric = yValues.some(val => typeof val === 'number' && !isNaN(val));
    
    if (chartType === 'bar' && xIsNumeric) {
      recommendations.push('Consider using a line chart for numeric X-axis data');
    }
    
    if (chartType === 'line' && !xIsNumeric) {
      recommendations.push('Consider using a bar chart for categorical X-axis data');
    }
    
    if (chartType === 'scatter' && (!xIsNumeric || !yIsNumeric)) {
      recommendations.push('Scatter plots work best with numeric data on both axes');
    }
    
    if (chartType === 'pie' && data.length > 10) {
      recommendations.push('Pie charts become hard to read with more than 10 categories. Consider a bar chart instead.');
    }
    
    // Check for outliers
    if (yIsNumeric) {
      const yNumbers = yValues.filter(val => typeof val === 'number' && !isNaN(val));
      if (yNumbers.length > 0) {
        const mean = yNumbers.reduce((sum, val) => sum + val, 0) / yNumbers.length;
        const std = Math.sqrt(yNumbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / yNumbers.length);
        const outliers = yNumbers.filter(val => Math.abs(val - mean) > 2 * std);
        
        if (outliers.length > 0) {
          recommendations.push(`Found ${outliers.length} potential outliers. Consider using a box plot to visualize the distribution.`);
        }
      }
    }
    
    return recommendations;
  }
}
