const SAME_SESSION_REASONS = new Set(['ALREADY_PUBLISHED_SAME_SESSION', 'ALREADY_PUBLISHED_IN_PERSISTED_LEDGER']);
/** GitHub job success does not imply a new article. A duplicate skip is success only
 * when a concrete previously published public Blogger URL and post ID are present. */
export function assessProductionGateOutcome(outcome) {
    const url = typeof outcome.publicPostUrl === 'string' ? outcome.publicPostUrl : null;
    const validUrl = !!url && /^https:\/\/motusnova\.blogspot\.com\/20\d\d\/\d\d\/[a-zA-Z0-9_-]+\.html(?:\?.*)?$/.test(url);
    const postId = typeof outcome.postId === 'string' ? outcome.postId : typeof outcome.draftPostId === 'string' ? outcome.draftPostId : null;
    const validPostId = !!postId && /^\d+$/.test(postId);
    if (outcome.state === 'PUBLISHED') {
        if (!validUrl || !validPostId)
            return { disposition: 'FAILED', ok: false, message: 'New publication lacks verified public URL or post ID', url: null };
        return { disposition: 'PUBLISHED', ok: true, message: 'New Blogger post published', url };
    }
    if (outcome.state === 'SKIP' && SAME_SESSION_REASONS.has(String(outcome.reasonCode))) {
        const session = outcome.sessionDate;
        if (!validUrl || !validPostId || typeof session !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(session))
            return { disposition: 'FAILED', ok: false, message: 'Existing-session SKIP lacks post ID, public URL or session date', url: null };
        return { disposition: 'EXISTING_SESSION_POST', ok: true, message: 'No new post: a Blogger article already exists for the market session ' + session, url };
    }
    return { disposition: 'FAILED', ok: false, message: 'Production publication not completed', url: null };
}
