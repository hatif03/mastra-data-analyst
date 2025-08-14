import { z } from 'zod';
import { Tool } from '@mastra/core';

const SQLQueryInputSchema = z.object({
  query: z.string().describe('The SQL query to execute'),
  data: z.array(z.record(z.any())).describe('The data to query against'),
  columns: z.array(z.string()).describe('The column names of the data'),
});

const SQLQueryOutputSchema = z.object({
  success: z.boolean(),
  result: z.array(z.record(z.any())).optional(),
  error: z.string().optional(),
  queryType: z.enum(['SELECT', 'AGGREGATE', 'GROUP_BY', 'FILTER']).optional(),
  summary: z.object({
    rowCount: z.number().optional(),
    columnCount: z.number().optional(),
    numericColumns: z.array(z.string()).optional(),
    categoricalColumns: z.array(z.string()).optional(),
  }).optional(),
});

export class SQLQueryTool extends Tool<
  typeof SQLQueryInputSchema,
  typeof SQLQueryOutputSchema
> {
  name = 'sqlQueryTool';
  description = 'Executes SQL-like queries on in-memory data for analysis';
  inputSchema = SQLQueryInputSchema;
  outputSchema = SQLQueryOutputSchema;

  async execute(input: z.infer<typeof SQLQueryInputSchema>) {
    try {
      const { query, data, columns } = input;
      
      // Simple SQL-like query parser and executor
      const result = this.executeQuery(query, data, columns);
      
      return {
        success: true,
        result: result.data,
        queryType: result.queryType,
        summary: {
          rowCount: result.data.length,
          columnCount: result.data.length > 0 ? Object.keys(result.data[0]).length : 0,
          numericColumns: this.getNumericColumns(result.data),
          categoricalColumns: this.getCategoricalColumns(result.data),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private executeQuery(query: string, data: Record<string, any>[], columns: string[]) {
    const upperQuery = query.toUpperCase().trim();
    
    if (upperQuery.includes('SELECT') && upperQuery.includes('FROM')) {
      return this.executeSelectQuery(query, data, columns);
    } else if (upperQuery.includes('COUNT') || upperQuery.includes('SUM') || upperQuery.includes('AVG')) {
      return this.executeAggregateQuery(query, data, columns);
    } else if (upperQuery.includes('GROUP BY')) {
      return this.executeGroupByQuery(query, data, columns);
    } else if (upperQuery.includes('WHERE')) {
      return this.executeFilterQuery(query, data, columns);
    } else {
      // Default to returning all data
      return {
        data,
        queryType: 'SELECT' as const,
      };
    }
  }

  private executeSelectQuery(query: string, data: Record<string, any>[], columns: string[]) {
    // Simple SELECT * FROM data implementation
    return {
      data,
      queryType: 'SELECT' as const,
    };
  }

  private executeAggregateQuery(query: string, data: Record<string, any>[], columns: string[]) {
    const numericColumns = this.getNumericColumns(data);
    const result: Record<string, any> = {};
    
    numericColumns.forEach(col => {
      const values = data.map(row => row[col]).filter(val => typeof val === 'number' && !isNaN(val));
      if (values.length > 0) {
        result[`count_${col}`] = values.length;
        result[`sum_${col}`] = values.reduce((sum, val) => sum + val, 0);
        result[`avg_${col}`] = values.reduce((sum, val) => sum + val, 0) / values.length;
        result[`min_${col}`] = Math.min(...values);
        result[`max_${col}`] = Math.max(...values);
      }
    });
    
    return {
      data: [result],
      queryType: 'AGGREGATE' as const,
    };
  }

  private executeGroupByQuery(query: string, data: Record<string, any>[], columns: string[]) {
    // Simple GROUP BY implementation
    const groupByColumn = this.extractGroupByColumn(query);
    if (!groupByColumn || !columns.includes(groupByColumn)) {
      return { data, queryType: 'SELECT' as const };
    }
    
    const groups = new Map<string, Record<string, any>[]>();
    data.forEach(row => {
      const groupValue = row[groupByColumn] || 'Unknown';
      if (!groups.has(groupValue)) {
        groups.set(groupValue, []);
      }
      groups.get(groupValue)!.push(row);
    });
    
    const result = Array.from(groups.entries()).map(([groupValue, groupData]) => {
      const numericColumns = this.getNumericColumns(groupData);
      const row: Record<string, any> = { [groupByColumn]: groupValue };
      
      numericColumns.forEach(col => {
        const values = groupData.map(row => row[col]).filter(val => typeof val === 'number' && !isNaN(val));
        if (values.length > 0) {
          row[`count_${col}`] = values.length;
          row[`sum_${col}`] = values.reduce((sum, val) => sum + val, 0);
          row[`avg_${col}`] = values.reduce((sum, val) => sum + val, 0) / values.length;
        }
      });
      
      return row;
    });
    
    return {
      data: result,
      queryType: 'GROUP_BY' as const,
    };
  }

  private executeFilterQuery(query: string, data: Record<string, any>[], columns: string[]) {
    // Simple WHERE clause implementation
    const filterCondition = this.extractFilterCondition(query);
    if (!filterCondition) {
      return { data, queryType: 'SELECT' as const };
    }
    
    const filteredData = data.filter(row => {
      // Simple equality filter
      const [column, value] = filterCondition.split('=');
      if (column && value) {
        const cleanColumn = column.trim();
        const cleanValue = value.trim().replace(/['"]/g, '');
        return row[cleanColumn]?.toString() === cleanValue;
      }
      return true;
    });
    
    return {
      data: filteredData,
      queryType: 'FILTER' as const,
    };
  }

  private extractGroupByColumn(query: string): string | null {
    const match = query.match(/GROUP\s+BY\s+(\w+)/i);
    return match ? match[1] : null;
  }

  private extractFilterCondition(query: string): string | null {
    const match = query.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|$)/i);
    return match ? match[1].trim() : null;
  }

  private getNumericColumns(data: Record<string, any>[]): string[] {
    if (data.length === 0) return [];
    
    return Object.keys(data[0]).filter(col => {
      const sampleValues = data.slice(0, 10).map(row => row[col]);
      return sampleValues.some(val => typeof val === 'number' && !isNaN(val));
    });
  }

  private getCategoricalColumns(data: Record<string, any>[]): string[] {
    if (data.length === 0) return [];
    
    const numericColumns = this.getNumericColumns(data);
    return Object.keys(data[0]).filter(col => !numericColumns.includes(col));
  }
}
