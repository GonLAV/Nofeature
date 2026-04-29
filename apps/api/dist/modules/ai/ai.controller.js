"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
class AiController {
    constructor(aiService) {
        this.aiService = aiService;
        this.analyze = async (req, res, next) => {
            try {
                const result = await this.aiService.analyzeRootCause(req.params.id, req.user.tenantId);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.postmortem = async (req, res, next) => {
            try {
                const result = await this.aiService.generatePostmortem(req.params.id, req.user.tenantId);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
        this.suggestResponders = async (req, res, next) => {
            try {
                const result = await this.aiService.suggestResponders(req.params.id, req.user.tenantId);
                res.json({ success: true, data: result });
            }
            catch (err) {
                next(err);
            }
        };
    }
}
exports.AiController = AiController;
//# sourceMappingURL=ai.controller.js.map