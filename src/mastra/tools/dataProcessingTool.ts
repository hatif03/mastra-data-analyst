import { z } from 'zod';
import { Tool } from '@mastra/core';

const DataProcessingInputSchema = z.object({
  fileContent: z.string().describe('The content of the uploaded file (CSV or Excel)'),
  fileType: z.enum(['csv', 'xlsx', 'json']).describe('The type of file being processed'),
  options: z.object({
    encoding: z.string().optional().default('utf-8'),
    hasHeader: z.boolean().optional().default(true),
    delimiter: z.string().optional().default(','),
  }).optional(),
});

const DataProcessingOutputSchema = z.object({
  success: z.boolean(),
  data: z.array(z.record(z.any())).optional(),
  columns: z.array(z.string()).optional(),
  rowCount: z.number().optional(),
  error: z.string().optional(),
  cleanedData: z.array(z.record(z.any())).optional(),
});

export class DataProcessingTool extends Tool<
  typeof DataProcessingInputSchema,
  typeof DataProcessingOutputSchema
> {
  name = 'dataProcessingTool';
  description = 'Processes and cleans uploaded data files (CSV, Excel, JSON) for analysis';
  inputSchema = DataProcessingInputSchema;
  outputSchema = DataProcessingOutputSchema;

  async execute(input: z.infer<typeof DataProcessingInputSchema>) {
    try {
      const { fileContent, fileType, options = {} } = input;
      
      let data: any[] = [];
      let columns: string[] = [];

      // Parse the file content based on type
      if (fileType === 'csv') {
        const lines = fileContent.split('\n');
        if (options.hasHeader && lines.length > 0) {
          columns = lines[0].split(options.delimiter || ',').map(col => col.trim());
          data = lines.slice(1).map(line => {
            const values = line.split(options.delimiter || ',');
            const row: Record<string, any> = {};
            columns.forEach((col, index) => {
              row[col] = values[index]?.trim() || '';
            });
            return row;
          });
        } else {
          // Generate column names if no header
          const firstLine = lines[0];
          const columnCount = firstLine.split(options.delimiter || ',').length;
          columns = Array.from({ length: columnCount }, (_, i) => `Column_${i + 1}`);
          data = lines.map(line => {
            const values = line.split(options.delimiter || ',');
            const row: Record<string, any> = {};
            columns.forEach((col, index) => {
              row[col] = values[index]?.trim() || '';
            });
            return row;
          });
        }
      } else if (fileType === 'json') {
        try {
          const jsonData = JSON.parse(fileContent);
          if (Array.isArray(jsonData)) {
            data = jsonData;
            if (data.length > 0) {
              columns = Object.keys(data[0]);
            }
          } else {
            data = [jsonData];
            columns = Object.keys(jsonData);
          }
        } catch (parseError) {
          throw new Error(`Failed to parse JSON: ${parseError}`);
        }
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Clean the data
      const cleanedData = this.cleanData(data);

      return {
        success: true,
        data,
        columns,
        rowCount: data.length,
        cleanedData,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private cleanData(data: Record<string, any>[]): Record<string, any>[] {
    return data.map(row => {
      const cleanedRow: Record<string, any> = {};
      Object.entries(row).forEach(([key, value]) => {
        // Remove extra whitespace
        if (typeof value === 'string') {
          cleanedRow[key] = value.trim();
        } else {
          cleanedRow[key] = value;
        }
        
        // Convert empty strings to null
        if (cleanedRow[key] === '') {
          cleanedRow[key] = null;
        }
      });
      return cleanedRow;
    });
  }
}
