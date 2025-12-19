import { NextRequest, NextResponse } from 'next/server';

// ComfyUI APIへのプロキシ
// CORSを回避するためにサーバーサイドでリクエストを中継

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');
  const baseUrl = searchParams.get('baseUrl');

  if (!endpoint || !baseUrl) {
    return NextResponse.json(
      { error: 'endpoint and baseUrl are required' },
      { status: 400 }
    );
  }

  try {
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url);

    // 画像の場合はバイナリで返す
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
        },
      });
    }

    // JSONの場合
    if (!response.ok) {
      return NextResponse.json(
        { error: `ComfyUI error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('ComfyUI proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy request failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const endpoint = searchParams.get('endpoint');
  const baseUrl = searchParams.get('baseUrl');

  if (!endpoint || !baseUrl) {
    return NextResponse.json(
      { error: 'endpoint and baseUrl are required' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `ComfyUI error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('ComfyUI proxy error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Proxy request failed' },
      { status: 500 }
    );
  }
}
