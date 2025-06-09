export interface SarifResult {
    ruleId: string;
    message: string;
    level: string;
    locations: SarifLocation[];
}

export interface SarifMessage {
    text: string;
}

export interface SarifLocation {
    uri: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface SarifLocationInfo {
    physicalLocation?: {
        artifactLocation?: {
            uri: string;
        };
        region?: {
            startLine?: number;
            startColumn?: number;
            endLine?: number;
            endColumn?: number;
        };
    };
}

export interface SarifRun {
    results: any[];
}

export interface SarifLog {
    runs: SarifRun[];
}

export class SarifParser {
    public static parseSarifFile(sarifContent: string): SarifResult[] {
        try {
            const sarifLog: SarifLog = JSON.parse(sarifContent);
            const results: SarifResult[] = [];

            for (const run of sarifLog.runs) {
                for (const result of run.results) {
                    const locations: SarifLocation[] = [];
                    
                    if (result.locations) {
                        for (const location of result.locations) {
                            const physicalLocation = location.physicalLocation;
                            if (physicalLocation && physicalLocation.artifactLocation && physicalLocation.region) {
                                locations.push({
                                    uri: physicalLocation.artifactLocation.uri,
                                    startLine: physicalLocation.region.startLine || 1,
                                    startColumn: physicalLocation.region.startColumn || 1,
                                    endLine: physicalLocation.region.endLine || physicalLocation.region.startLine || 1,
                                    endColumn: physicalLocation.region.endColumn || physicalLocation.region.startColumn || 1
                                });
                            }
                        }
                    }

                    const messageText = typeof result.message === 'string' 
                        ? result.message 
                        : (result.message as SarifMessage)?.text || 'No message provided';
                    
                    results.push({
                        ruleId: result.ruleId || 'unknown',
                        message: messageText,
                        level: result.level || 'info',
                        locations: locations
                    });
                }
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to parse SARIF file: ${error}`);
        }
    }

    public static filterMisraResults(results: SarifResult[]): SarifResult[] {
        return results.filter(result => 
            result.ruleId.toLowerCase().includes('misra') || 
            result.message.toLowerCase().includes('misra')
        );
    }
}