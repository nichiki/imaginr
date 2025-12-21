// Image search API - full-text and attribute search
import { NextRequest, NextResponse } from 'next/server';
import { searchImages } from '@/lib/db/images';
import { searchByAttributeAsync } from '@/lib/db/attributes';
import { getDatabase } from '@/lib/db';

// GET /api/images/search?q=blonde&attr=hair.color:blonde&deleted=true
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const attrQuery = searchParams.get('attr'); // format: "key:value"
    const includeDeleted = searchParams.get('deleted') === 'true';

    // Full-text search
    if (query) {
      const images = await searchImages(query, includeDeleted);
      return NextResponse.json({ images, searchType: 'fulltext', query });
    }

    // Attribute search
    if (attrQuery) {
      const [key, value] = attrQuery.split(':');
      if (!key || !value) {
        return NextResponse.json(
          { error: 'Invalid attr format. Use key:value' },
          { status: 400 }
        );
      }

      const db = await getDatabase();
      const imageIds = await searchByAttributeAsync(db, key, value);

      // Get full image info for matching IDs
      if (imageIds.length === 0) {
        return NextResponse.json({ images: [], searchType: 'attribute', query: attrQuery });
      }

      const placeholders = imageIds.map(() => '?').join(',');
      const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';

      const rows = await db.select<{
        id: string;
        filename: string;
        prompt_yaml: string;
        created_at: string;
        deleted_at: string | null;
        favorite: number;
      }>(`
        SELECT id, filename, prompt_yaml, created_at, deleted_at, favorite
        FROM images
        WHERE id IN (${placeholders})
        ${deletedClause}
        ORDER BY created_at DESC
      `, imageIds);

      const images = rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        createdAt: row.created_at,
        prompt: row.prompt_yaml,
        deleted: !!row.deleted_at,
        favorite: row.favorite === 1,
      }));

      return NextResponse.json({ images, searchType: 'attribute', query: attrQuery });
    }

    return NextResponse.json(
      { error: 'Either q or attr parameter is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json(
      { error: 'Search failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
