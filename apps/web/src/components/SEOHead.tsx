'use client';

import Head from 'next/head';
import { useTranslation } from '@/hooks/useTranslation';

interface SEOHeadProps {
  titleKey?: string;
  descriptionKey?: string;
  customTitle?: string;
  customDescription?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    section?: string;
    tags?: string[];
  };
}

export function SEOHead({
  titleKey,
  descriptionKey,
  customTitle,
  customDescription,
  keywords = [],
  image = '/images/og-image.png',
  url,
  type = 'website',
  article,
}: SEOHeadProps) {
  const { t, locale } = useTranslation('seo');

  // Get title and description
  const title = customTitle || (titleKey ? t(titleKey) : t('seo.defaultTitle'));
  const description =
    customDescription || (descriptionKey ? t(descriptionKey) : t('seo.defaultDescription'));
  const siteName = 'Cotiza Studio';

  // Build canonical URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.cotiza.studio';
  const canonicalUrl = url ? `${baseUrl}${url}` : baseUrl;

  // Alternate language URLs
  const alternateUrls = {
    es: canonicalUrl.replace(/\/(en|pt-BR)/, '/es'),
    en: canonicalUrl.replace(/\/(es|pt-BR)/, '/en'),
    'pt-BR': canonicalUrl.replace(/\/(es|en)/, '/pt-BR'),
  };

  // Language codes for Open Graph
  const ogLocale = locale === 'pt-BR' ? 'pt_BR' : locale;
  const alternateLocales = {
    es: 'es_ES',
    en: 'en_US',
    'pt-BR': 'pt_BR',
  };

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{`${title} | ${siteName}`}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <meta name="author" content={siteName} />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta charSet="UTF-8" />

      {/* Language and Locale */}
      <meta httpEquiv="content-language" content={locale} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Alternate Language Links */}
      <link rel="alternate" hrefLang="es" href={alternateUrls['es']} />
      <link rel="alternate" hrefLang="en" href={alternateUrls['en']} />
      <link rel="alternate" hrefLang="pt-BR" href={alternateUrls['pt-BR']} />
      <link rel="alternate" hrefLang="x-default" href={alternateUrls['es']} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:image" content={`${baseUrl}${image}`} />
      <meta property="og:image:alt" content={title} />
      <meta property="og:locale" content={ogLocale} />

      {/* Alternate Locales for Open Graph */}
      {Object.entries(alternateLocales).map(
        ([key, value]) =>
          key !== locale && <meta key={key} property="og:locale:alternate" content={value} />,
      )}

      {/* Article specific tags */}
      {type === 'article' && article && (
        <>
          {article.publishedTime && (
            <meta property="article:published_time" content={article.publishedTime} />
          )}
          {article.modifiedTime && (
            <meta property="article:modified_time" content={article.modifiedTime} />
          )}
          {article.author && <meta property="article:author" content={article.author} />}
          {article.section && <meta property="article:section" content={article.section} />}
          {article.tags?.map((tag) => <meta key={tag} property="article:tag" content={tag} />)}
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${baseUrl}${image}`} />
      <meta name="twitter:site" content="@CotizaStudio" />
      <meta name="twitter:creator" content="@CotizaStudio" />

      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': type === 'website' ? 'WebSite' : type === 'article' ? 'Article' : 'Product',
            name: title,
            description: description,
            url: canonicalUrl,
            inLanguage: locale,
            publisher: {
              '@type': 'Organization',
              name: siteName,
              logo: {
                '@type': 'ImageObject',
                url: `${baseUrl}/images/logo.png`,
              },
            },
            ...(type === 'article' && article
              ? {
                  datePublished: article.publishedTime,
                  dateModified: article.modifiedTime,
                  author: {
                    '@type': 'Person',
                    name: article.author || siteName,
                  },
                }
              : {}),
          }),
        }}
      />

      {/* Favicon and App Icons */}
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="manifest" href="/site.webmanifest" />
      <meta name="theme-color" content="#667eea" />
    </Head>
  );
}
