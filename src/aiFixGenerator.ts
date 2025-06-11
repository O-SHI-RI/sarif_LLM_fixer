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
        
        return this.makeRequestWithRetry(prompt, violatedCode, sarifResult.ruleId);
    }

    private async makeRequestWithRetry(
        prompt: string, 
        violatedCode: string, 
        ruleId: string, 
        maxRetries: number = 2,
        currentRetry: number = 0
    ): Promise<AiFixSuggestion> {
        // Add a small delay before each request to avoid rate limiting
        await this.sleep(2000); // 2 second delay
        
        const requestPayload = {
            model: 'gpt-4o',
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
        };

        console.log('=== OpenAI API Request ===');
        console.log('URL:', this.apiUrl);
        console.log('Request payload:', JSON.stringify(requestPayload, null, 2));
        console.log('API Key present:', !!this.apiKey);
        console.log('API Key length:', this.apiKey?.length || 0);
        
        try {
            const response = await axios.post(this.apiUrl, requestPayload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 second timeout
            });

            console.log('=== OpenAI API Response ===');
            console.log('Status:', response.status);
            console.log('Response data:', JSON.stringify(response.data, null, 2));

            const aiResponse = response.data.choices[0].message.content;
            console.log('=== Extracted AI Response ===');
            console.log('AI Response:', aiResponse);
            
            return this.parseAiResponse(aiResponse, violatedCode, ruleId);
        } catch (error: any) {
            console.log('=== OpenAI API Error ===');
            console.log('Error message:', error.message);
            console.log('Error code:', error.code);
            console.log('Response status:', error.response?.status);
            console.log('Response data:', error.response?.data);
            console.log('Response headers:', error.response?.headers);
            
            if (error.response?.status === 429 && currentRetry < maxRetries) {
                const retryAfter = error.response.headers['retry-after'] || Math.pow(2, currentRetry + 1) * 60;
                console.log(`Rate limit hit. Retrying in ${retryAfter} seconds... (${currentRetry + 1}/${maxRetries})`);
                
                await this.sleep(retryAfter * 1000);
                return this.makeRequestWithRetry(prompt, violatedCode, ruleId, maxRetries, currentRetry + 1);
            } else if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'] || 60;
                throw new Error(`Rate limit exceeded after ${maxRetries} retries. Please wait ${retryAfter} seconds before trying again.`);
            } else if (error.response?.status === 401) {
                throw new Error('Invalid API key. Please check your OpenAI API key.');
            } else if (error.response?.status === 403) {
                throw new Error('Access denied. Your API key may not have access to gpt-4o model.');
            } else if (error.code === 'ECONNABORTED' || error.code === 'TIMEOUT') {
                throw new Error('Request timeout. The AI service took too long to respond. Please try again.');
            } else {
                throw new Error(`Failed to generate AI fix: ${error.message || error}`);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
1. ONLY fix the specific line(s) that violate the rule - do not include headers, function declarations, or complete programs
2. Keep the fix minimal and focused on the violation
3. Maintain the original code structure and context
4. Provide a clear explanation of what was changed and why

Format your response as:
FIXED_CODE:
\`\`\`c
[only the fixed line(s) here - no complete program]
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