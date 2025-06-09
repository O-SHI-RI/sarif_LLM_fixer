import axios from 'axios';
import { SarifResult } from './sarifParser';
import { MisraRule } from './misraRuleIdentifier';

export interface AiFixSuggestion {
    originalCode: string;
    fixedCode: string;
    explanation: string;
    ruleId: string;
}

export class AiFixGenerator {
    private apiKey: string;
    private apiUrl: string = 'https://api.openai.com/v1/chat/completions';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    public async generateFix(
        violatedCode: string,
        sarifResult: SarifResult,
        misraRule: MisraRule
    ): Promise<AiFixSuggestion> {
        const prompt = this.createPrompt(violatedCode, sarifResult, misraRule);
        
        try {
            const response = await axios.post(this.apiUrl, {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert C programmer who specializes in MISRA-C compliance. Your task is to analyze code violations and provide specific, compliant fixes.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiResponse = response.data.choices[0].message.content;
            return this.parseAiResponse(aiResponse, violatedCode, sarifResult.ruleId);
        } catch (error) {
            throw new Error(`Failed to generate AI fix: ${error}`);
        }
    }

    private createPrompt(violatedCode: string, sarifResult: SarifResult, misraRule: MisraRule): string {
        return `
MISRA-C Rule Violation Analysis and Fix:

Rule ID: ${sarifResult.ruleId}
Rule Title: ${misraRule.title}
Rule Description: ${misraRule.description}
Severity: ${misraRule.severity}

Violated Code:
\`\`\`c
${violatedCode}
\`\`\`

Violation Message: ${sarifResult.message}

MISRA-C Remediation Guidance: ${misraRule.remediation}

Please provide:
1. A fixed version of the code that complies with the MISRA-C rule
2. A clear explanation of what was changed and why
3. Ensure the fix maintains the original functionality while addressing the violation

Format your response as:
FIXED_CODE:
\`\`\`c
[fixed code here]
\`\`\`

EXPLANATION:
[explanation of the changes made]
`;
    }

    private parseAiResponse(aiResponse: string, originalCode: string, ruleId: string): AiFixSuggestion {
        const fixedCodeMatch = aiResponse.match(/FIXED_CODE:\s*```c\s*([\s\S]*?)\s*```/);
        const explanationMatch = aiResponse.match(/EXPLANATION:\s*([\s\S]*?)(?:\n\n|$)/);

        const fixedCode = fixedCodeMatch ? fixedCodeMatch[1].trim() : 'No fix provided';
        const explanation = explanationMatch ? explanationMatch[1].trim() : 'No explanation provided';

        return {
            originalCode,
            fixedCode,
            explanation,
            ruleId
        };
    }
}