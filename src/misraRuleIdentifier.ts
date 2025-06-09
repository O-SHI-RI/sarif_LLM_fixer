import * as fs from 'fs';
import * as path from 'path';
import { SarifResult } from './sarifParser';

export interface MisraRule {
    title: string;
    description: string;
    category: string;
    severity: string;
    example: string;
    remediation: string;
}

export interface MisraRuleData {
    rules: { [ruleId: string]: MisraRule };
}

export class MisraRuleIdentifier {
    private misraRules: MisraRuleData;

    constructor(misraRulesPath: string) {
        try {
            const rulesContent = fs.readFileSync(misraRulesPath, 'utf8');
            this.misraRules = JSON.parse(rulesContent);
        } catch (error) {
            throw new Error(`Failed to load MISRA rules from ${misraRulesPath}: ${error}`);
        }
    }

    public identifyMisraRule(sarifResult: SarifResult): MisraRule | null {
        // Extract MISRA rule ID from various possible formats
        const ruleId = this.extractMisraRuleId(sarifResult);
        
        if (ruleId && this.misraRules.rules[ruleId]) {
            return this.misraRules.rules[ruleId];
        }

        return null;
    }

    private extractMisraRuleId(sarifResult: SarifResult): string | null {
        // Check direct rule ID
        if (sarifResult.ruleId && this.misraRules.rules[sarifResult.ruleId]) {
            return sarifResult.ruleId;
        }

        // Extract from rule ID patterns like "MISRA-C-2012-10.1"
        const ruleIdMatch = sarifResult.ruleId.match(/(\d+\.\d+)$/);
        if (ruleIdMatch) {
            const extractedId = ruleIdMatch[1];
            if (this.misraRules.rules[extractedId]) {
                return extractedId;
            }
        }

        // Extract from message patterns
        const messageMatch = sarifResult.message.match(/MISRA[^\d]*(\d+\.\d+)/i);
        if (messageMatch) {
            const extractedId = messageMatch[1];
            if (this.misraRules.rules[extractedId]) {
                return extractedId;
            }
        }

        return null;
    }

    public getAllMisraRules(): { [ruleId: string]: MisraRule } {
        return this.misraRules.rules;
    }
}