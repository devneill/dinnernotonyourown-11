import { invariant } from '@epic-web/invariant'

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY
invariant(GOOGLE_PLACES_API_KEY, 'GOOGLE_PLACES_API_KEY must be set')
const apiKey: string = GOOGLE_PLACES_API_KEY

interface NearbySearchParams {
	lat: number
	lng: number
	radius: number
	minRating?: number
	maxPrice?: number
}

interface Restaurant {
	id: string
	name: string
	address: string
	cuisineType: string
	priceLevel: number
	rating: number
	lat: number
	lng: number
	photoUrl: string
	mapsUrl: string
}

interface GooglePlacesResponse {
	status: string
	error_message?: string
	results: Array<{
		place_id: string
		name: string
		rating: number
		price_level?: number
		geometry: {
			location: {
				lat: number
				lng: number
			}
		}
	}>
}

interface GooglePlaceDetailsResponse {
	status: string
	error_message?: string
	result: {
		formatted_address: string
		photos?: Array<{
			photo_reference: string
		}>
		url: string
		types: string[]
	}
}

export async function getNearbyRestaurants({
	lat,
	lng,
	radius,
	minRating,
	maxPrice,
}: NearbySearchParams): Promise<Restaurant[]> {
	// Nearby Search API call
	const nearbySearchUrl = new URL(
		'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
	)
	nearbySearchUrl.searchParams.set('key', apiKey)
	nearbySearchUrl.searchParams.set('location', `${lat},${lng}`)
	nearbySearchUrl.searchParams.set('radius', radius.toString())
	nearbySearchUrl.searchParams.set('type', 'restaurant')
	if (maxPrice) {
		nearbySearchUrl.searchParams.set('maxprice', maxPrice.toString())
	}

    console.log(apiKey)
	const nearbySearchResponse = await fetch(nearbySearchUrl)
	if (!nearbySearchResponse.ok) {
		throw new Error('Failed to fetch nearby restaurants')
	}

	const nearbySearchData = (await nearbySearchResponse.json()) as GooglePlacesResponse
	if (nearbySearchData.status !== 'OK' && nearbySearchData.status !== 'ZERO_RESULTS') {
		throw new Error(
			`Google Places API Error: ${nearbySearchData.status}${
				nearbySearchData.error_message
					? ` - ${nearbySearchData.error_message}`
					: ''
			}`,
		)
	}

	// Filter by rating if specified
	let restaurants = nearbySearchData.results
	if (minRating) {
		restaurants = restaurants.filter(place => place.rating >= minRating)
	}

	// Get additional details for each restaurant
	const detailedRestaurants = await Promise.all(
		restaurants.map(async restaurant => {
			const detailsUrl = new URL(
				'https://maps.googleapis.com/maps/api/place/details/json',
			)
			detailsUrl.searchParams.set('key', apiKey)
			detailsUrl.searchParams.set('place_id', restaurant.place_id)
			detailsUrl.searchParams.set(
				'fields',
				'formatted_address,photos,url,types',
			)

			const detailsResponse = await fetch(detailsUrl)
			if (!detailsResponse.ok) {
				throw new Error(
					`Failed to fetch details for restaurant ${restaurant.name}`,
				)
			}

			const detailsData = (await detailsResponse.json()) as GooglePlaceDetailsResponse
			if (detailsData.status !== 'OK') {
				throw new Error(
					`Google Places API Error: ${detailsData.status}${
						detailsData.error_message
							? ` - ${detailsData.error_message}`
							: ''
					}`,
				)
			}

			const details = detailsData.result

			// Get photo URL if available
			let photoUrl = ''
			if (details.photos?.[0]?.photo_reference) {
				const photoReference = details.photos[0].photo_reference
				photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoReference}&key=${apiKey}`
			}

			// Determine cuisine type from available types
			const cuisineType = details.types
				.find(
					(type: string) =>
						!['restaurant', 'food', 'point_of_interest', 'establishment'].includes(
							type,
						),
				)
				?.replace(/_/g, ' ') || 'restaurant'

			return {
				id: restaurant.place_id,
				name: restaurant.name,
				address: details.formatted_address,
				cuisineType,
				priceLevel: restaurant.price_level || 0,
				rating: restaurant.rating,
				lat: restaurant.geometry.location.lat,
				lng: restaurant.geometry.location.lng,
				photoUrl,
				mapsUrl: details.url,
			}
		}),
	)

	return detailedRestaurants
} 