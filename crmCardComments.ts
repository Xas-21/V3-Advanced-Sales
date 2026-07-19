export type CrmCardCommentTargetType = 'request' | 'account';

export type CrmCardComment = {
    id: string;
    targetType: CrmCardCommentTargetType;
    targetId: string;
    body: string;
    authorUserId: string;
    authorName: string;
    createdAt: string;
};

/** `commentsNewestFirst` must already be newest-first from the API. */
export function visibleCardComments(
    commentsNewestFirst: CrmCardComment[],
    expanded: boolean,
    recentLimit = 2
): CrmCardComment[] {
    const list = Array.isArray(commentsNewestFirst) ? commentsNewestFirst : [];
    if (expanded || list.length <= recentLimit) return list;
    return list.slice(0, recentLimit);
}

export const CRM_CARD_COMMENT_MAX = 5;
export const CRM_CARD_COMMENT_BODY_MAX = 500;
